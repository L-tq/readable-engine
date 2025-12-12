import { addEntity, addComponent, IWorld } from 'bitecs';
import { EntityDefSchema } from '../data/schema';
import { Registry } from '../ecs/Registry';
import { SimBridge } from './SimBridge';

export class Hydrator {
    constructor(private world: IWorld, private bridge: SimBridge) { }

    /**
     * Spawns an entity from a JSON definition.
     */
    spawnEntity(jsonDef: any, overridePos?: { x: number, y: number }): number {
        // 1. Validate Schema
        const result = EntityDefSchema.safeParse(jsonDef);
        if (!result.success) {
            console.warn(`[Hydrator] Schema Validation Failed for ${jsonDef.name}:`, result.error);
            return -1;
        }

        const def = result.data;
        const eid = addEntity(this.world);

        // 2. Iterate Defined Components
        for (const [key, value] of Object.entries(def.components)) {
            if (value === undefined || value === null) continue;

            // SPECIAL: Physics
            // Physics is not a JS component, it's a request to the Rust Core.
            if (key === 'Physics' && def.components.Position) {
                const pos = overridePos || def.components.Position;
                const phys = def.components.Physics!; // Schema guarantees presence if key exists

                // Send to Rust
                this.bridge.addAgent(eid, pos.x, pos.y, phys.radius, phys.max_speed);
                continue;
            }

            // STANDARD: JS Components
            const regEntry = Registry.get(key);
            if (regEntry) {
                addComponent(this.world, regEntry.component, eid);

                // Determine data (Override position if provided)
                let data = value;
                if (key === 'Position' && overridePos) {
                    data = overridePos;
                }

                regEntry.setter(this.world, eid, data);
            }
        }

        return eid;
    }
}