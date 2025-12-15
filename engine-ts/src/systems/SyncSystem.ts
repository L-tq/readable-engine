import { IWorld, hasComponent, addComponent } from 'bitecs';
import { SimBridge } from '../core/SimBridge';
import { Position, Velocity, PrevPosition } from '../ecs/components';

export const createSyncSystem = (bridge: SimBridge) => {
    return (world: IWorld) => {
        const buffer = bridge.getStateBuffer();
        if (!buffer) return world;

        const stride = 5; // [id, x, y, vx, vy]
        const count = buffer.length / stride;

        for (let i = 0; i < count; i++) {
            const offset = i * stride;
            const id = buffer[offset];

            // Ensure entity has PrevPosition for interpolation
            if (!hasComponent(world, PrevPosition, id)) {
                addComponent(world, PrevPosition, id);
                // Initialize Prev with current (prevents flying in from 0,0)
                PrevPosition.x[id] = buffer[offset + 1];
                PrevPosition.y[id] = buffer[offset + 2];
            } else {
                // Copy Current -> Prev before updating Current
                PrevPosition.x[id] = Position.x[id];
                PrevPosition.y[id] = Position.y[id];
            }

            // Sync New State
            Position.x[id] = buffer[offset + 1];
            Position.y[id] = buffer[offset + 2];
            Velocity.x[id] = buffer[offset + 3];
            Velocity.y[id] = buffer[offset + 4];
        }

        return world;
    };
};