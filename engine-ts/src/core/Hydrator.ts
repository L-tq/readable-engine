import { addEntity, addComponent, IWorld } from 'bitecs';
import { EntityDefSchema } from '../data/schema';
import { Registry } from '../ecs/Registry';
import { SimBridge } from './SimBridge';
import { Position } from '../ecs/components'; // Import Position directly

export class Hydrator {
    constructor(private world: IWorld, private bridge: SimBridge) { }

    spawnEntity(jsonDef: any, overridePos?: { x: number, y: number }): number {
        // 1. Validate Schema
        const result = EntityDefSchema.safeParse(jsonDef);
        if (!result.success) {
            console.warn(`[Hydrator] Schema Validation Failed for ${jsonDef.name}:`, result.error);
            return -1;
        }

        const def = result.data;
        const eid = addEntity(this.world);

        // --- FIX: Explicitly handle Position if override is provided ---
        // Even if the JSON doesn't have "Position", we must add it if we are spawning into the world.
        if (overridePos) {
            addComponent(this.world, Position, eid);
            Position.x[eid] = overridePos.x;
            Position.y[eid] = overridePos.y;
        }

        // 2. Iterate Defined Components
        for (const [key, value] of Object.entries(def.components)) {
            if (value === undefined || value === null) continue;

            // Skip Position in the loop if we already handled it via override
            if (key === 'Position' && overridePos) continue;

            // SPECIAL: Physics
            if (key === 'Physics') {
                // Use override position or default to 0,0
                const posX = overridePos?.x ?? (def.components.Position?.x || 0);
                const posY = overridePos?.y ?? (def.components.Position?.y || 0);

                const phys = def.components.Physics!;
                this.bridge.addAgent(eid, posX, posY, phys.radius, phys.max_speed);
                continue;
            }

            // STANDARD: JS Components
            const regEntry = Registry.get(key);
            if (regEntry) {
                addComponent(this.world, regEntry.component, eid);
                regEntry.setter(this.world, eid, value);
            }
        }

        return eid;
    }
}