import { IWorld } from 'bitecs';
import { SimBridge } from '../core/SimBridge';
import { Position, Velocity } from '../ecs/components';

export const createSyncSystem = (bridge: SimBridge) => {
    return (world: IWorld) => {
        const buffer = bridge.getStateBuffer();
        if (!buffer) return world;

        // Buffer Layout: [id, x, y, vx, vy]
        // Stride = 5
        const stride = 5;
        const count = buffer.length / stride;

        for (let i = 0; i < count; i++) {
            const offset = i * stride;
            const id = buffer[offset];

            // Check if entity exists in world (Safety)
            // In bitECS, we assume the ID from Rust matches the Entity ID

            // Sync Position
            Position.x[id] = buffer[offset + 1];
            Position.y[id] = buffer[offset + 2];

            // Sync Velocity
            Velocity.x[id] = buffer[offset + 3];
            Velocity.y[id] = buffer[offset + 4];
        }

        return world;
    };
};