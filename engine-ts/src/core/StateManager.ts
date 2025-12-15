import { IWorld, getAllEntities, removeEntity, addEntity, addComponent, hasComponent } from 'bitecs';
import { SimBridge } from './SimBridge';
import { Registry } from '../ecs/Registry';

export interface EntitySnapshot {
    id: number;       // The ID at the time of saving
    defName?: string; // Optional metadata (e.g., "Marine")
    components: Record<string, any>;
}

export interface GameSnapshot {
    timestamp: number;
    sim: any; // Rust Snapshot (Opaque binary/json blob)
    ecs: {
        entities: EntitySnapshot[]
    }
}

export class StateManager {
    constructor(
        private world: IWorld,
        private bridge: SimBridge
    ) { }

    /**
     * Serializes the entire game state (Rust + JS) dynamically.
     */
    createSnapshot(): GameSnapshot {
        // 1. Get Rust State
        const simSnap = this.bridge.getSnapshot();

        // 2. Get ECS State
        const entities: EntitySnapshot[] = [];
        const eids = getAllEntities(this.world);
        const registeredComponents = Registry.getAll();

        for (const eid of eids) {
            const componentData: Record<string, any> = {};
            let hasData = false;

            // Iterate ALL registered components to see if this entity has them
            for (const entry of registeredComponents) {
                // Optimization: Only attempt to save components the entity actually possesses.
                // This prevents saving thousands of default/empty components.
                if (hasComponent(this.world, entry.component, eid)) {
                    try {
                        const data = entry.serializer(this.world, eid);
                        componentData[entry.name] = data;
                        hasData = true;
                    } catch (e) {
                        console.warn(`[StateManager] Failed to serialize '${entry.name}' for entity ${eid}`, e);
                    }
                }
            }

            // Only save entities that actually have game data
            // (This implicitly filters out any ghost entities if they exist)
            if (hasData) {
                entities.push({
                    id: eid,
                    components: componentData
                });
            }
        }

        return {
            timestamp: Date.now(),
            sim: simSnap,
            ecs: { entities }
        };
    }

    /**
     * Loads a snapshot, handling ID remapping between Rust and JS.
     */
    loadSnapshot(snap: GameSnapshot) {
        console.log(`[StateManager] Loading Snapshot from t=${snap.timestamp}`);

        // 1. Clear JS ECS
        // We must remove all existing entities to prevent ID collisions or ghost units.
        const currentEids = getAllEntities(this.world);
        for (const eid of currentEids) {
            removeEntity(this.world, eid);
        }

        // 2. Restore Rust State
        // At this point, Rust has restored its Agents with their OLD IDs (e.g., ID 5, ID 12).
        this.bridge.loadSnapshot(snap.sim);

        // 3. Restore JS ECS & Track ID Mapping
        // bitECS will generate NEW IDs (e.g., ID 100, ID 101) because we are adding entities fresh.
        // We must map [Snapshot ID] -> [New Runtime ID].
        const oldIds: number[] = [];
        const newIds: number[] = [];

        for (const entSnap of snap.ecs.entities) {
            const newEid = addEntity(this.world);

            // Track the mapping for the Rust update step
            oldIds.push(entSnap.id);
            newIds.push(newEid);

            // Hydrate Components
            for (const [compName, compData] of Object.entries(entSnap.components)) {
                const regEntry = Registry.get(compName);

                // Only add component if it exists in our registry
                if (regEntry) {
                    addComponent(this.world, regEntry.component, newEid);
                    regEntry.setter(this.world, newEid, compData);
                } else {
                    console.warn(`[StateManager] Snapshot contains unknown component: '${compName}'. Skipping.`);
                }
            }
        }

        // 4. Sync Rust IDs (Critical Step)
        // We must tell the Rust simulation that "Agent 5 is now Agent 100".
        // We pass TypedArrays to Wasm for zero-overhead copying.
        this.bridge.remapIds(new Uint32Array(oldIds), new Uint32Array(newIds));

        console.log(`[StateManager] Snapshot Loaded. Remapped ${oldIds.length} entities.`);
    }
}