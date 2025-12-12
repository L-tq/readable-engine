import { addEntity, addComponent, IWorld } from 'bitecs';
import { EntityDef, EntityDefSchema } from '../data/schema';
import { Registry } from '../ecs/Registry';
import { SimBridge } from './SimBridge';

export class Hydrator {
    constructor(private world: IWorld, private bridge: SimBridge) { }

    /**
     * Spawns an entity from a JSON definition.
     */
    spawnEntity(jsonDef: any, overridePos?: { x: number, y: number }): number {
        // 1. Validate Schema (Safety Rail for LLM)
        const result = EntityDefSchema.safeParse(jsonDef);
        if (!result.success) {
            console.warn(`[Hydrator] Failed to spawn ${jsonDef.name || 'Unknown'}:`, result.error);
            return -1;
        }

        const def = result.data;
        const eid = addEntity(this.world);

        // 2. Iterate Components
        for (const [key, value] of Object.entries(def.components)) {
            if (!value) continue;

            // Handle "Physics" specially (It lives in Rust)
            if (key === 'Physics' && def.components.Position) {
                const pos = overridePos || def.components.Position;
                const phys = def.components.Physics!;

                // Send to Rust: ID, x, y, radius, speed
                this.bridge.addAgent(eid, pos.x, pos.y, phys.radius, phys.max_speed);
                continue;
            }

            // Handle Standard ECS Components
            const regEntry = Registry.get(key);
            if (regEntry) {
                addComponent(this.world, regEntry.component, eid);

                // Apply overrides if needed
                let data = value;
                if (key === 'Position' && overridePos) {
                    data = overridePos;
                }

                regEntry.setter(this.world, eid, data);
            } else {
                console.warn(`[Hydrator] Warning: Component '${key}' not found in Registry.`);
            }
        }

        return eid;
    }
}