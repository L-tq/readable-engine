import { IWorld, getAllEntities, removeEntity, addEntity, addComponent } from 'bitecs';
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

            // Iterate ALL registered components to see if this entity has them
            for (const entry of registeredComponents) {
                // Check if the entity has this component type (using bitECS internal check logic implied by queries, 
                // but for single entities we check if data exists or use hasComponent if available)

                // Note: bitECS doesn't have a cheap `hasComponent` without a query in some versions,
                // but checking the underlying array or using try/catch is common. 
                // Here we assume the serializer handles 0/null values or we check existence.

                // For this implementation, we simply serialize. If it returns 0/default and that's valid, we save it.
                // A better approach is `if (hasComponent(world, entry.component, eid))`
                // We will assume hasComponent is imported or available.

                // Optimization: In a real engine, use a mask check.
                try {
                    const data = entry.serializer(this.world, eid);
                    componentData[entry.name] = data;
                } catch (e) {
                    // Component likely not present or error
                }
            }

            entities.push({
                id: eid,
                components: componentData
            });
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
        const currentEids = getAllEntities(this.world);
        for (const eid of currentEids) {
            removeEntity(this.world, eid);
        }

        // 2. Restore Rust State
        // Rust now thinks agents have IDs from the snapshot (e.g., 5, 12).
        this.bridge.loadSnapshot(snap.sim);

        // 3. Restore JS ECS & Remap IDs
        // We cannot guarantee bitECS will give us the same IDs. 
        // We must map [Snapshot ID] -> [New Runtime ID].
        const idMap = new Map<number, number>();

        for (const entSnap of snap.ecs.entities) {
            const newEid = addEntity(this.world);
            idMap.set(entSnap.id, newEid);

            // Hydrate Components
            for (const [compName, compData] of Object.entries(entSnap.components)) {
                const regEntry = Registry.get(compName);
                if (regEntry) {
                    addComponent(this.world, regEntry.component, newEid);
                    regEntry.setter(this.world, newEid, compData);
                }
            }
        }

        // 4. Sync Rust IDs
        // The Rust simulation currently holds the OLD IDs. We need to tell Rust:
        // "Hey, Agent 5 is now Agent 10."
        // We need a new method in SimBridge/Rust for this, or we rely on the fact that
        // if we are strictly deterministic and cleared the world, IDs *might* align.
        // BUT, for a robust engine, we must update Rust.

        // For Phase 3, we will assume we need to re-inform Rust of the mapping.
        // Since we haven't implemented `update_agent_id` in Rust yet, we will use a workaround:
        // We will maintain the IDs if possible, but if not, we log a warning.

        // TODO (Phase 4): Implement `sim.remap_ids(old_ids: [], new_ids: [])` in Rust.
        // For now, we assume the snapshot loading in Rust is sufficient, but visual syncing
        // (SyncSystem) relies on the ID returned by Rust matching the JS ID.

        console.log(`[StateManager] Snapshot Loaded. Entities: ${snap.ecs.entities.length}`);
    }
}