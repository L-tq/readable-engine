import { createWorld } from 'bitecs';
import { SimBridge } from "./core/SimBridge";
import { GameLoop } from "./core/GameLoop";
import { Hydrator } from "./core/Hydrator";
import { Position, Velocity } from "./ecs/components";

// 1. The "LLM" Data (Human Readable)
const MARINE_DEF = {
    name: "Marine",
    components: {
        Position: { x: 0, y: 0 },
        Health: { current: 50, max: 50 },
        UnitState: { state: "IDLE" },
        Physics: { radius: 0.5, max_speed: 0.5 }
    }
};

async function main() {
    // Init Core
    const bridge = new SimBridge();
    await bridge.init();

    // Init ECS
    const world = createWorld();
    const hydrator = new Hydrator(world, bridge);

    // Spawn Units via Hydrator
    console.log("Creating 25 units from JSON definition...");
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            // We reuse the Marine Def but override the position
            hydrator.spawnEntity(MARINE_DEF, { x: 10 + i, y: 10 + j });
        }
    }

    // Initial Command
    const initialCmd = JSON.stringify([{
        id: 0, // Global command for demo
        action: "MOVE",
        target_x: 50,
        target_y: 50,
        mode: "FLOW"
    }]);
    bridge.tick(initialCmd);

    // Renderer
    const render = (alpha: number) => {
        // 1. Sync Phase: Get Physics Data from Rust and update ECS
        const buffer = bridge.getStateBuffer();
        if (buffer) {
            // Buffer Format: [id, x, y, vx, vy, ...]
            // Stride = 5
            for (let i = 0; i < buffer.length; i += 5) {
                const id = buffer[i];
                const x = buffer[i + 1];
                const y = buffer[i + 2];
                const vx = buffer[i + 3];
                const vy = buffer[i + 4];

                // Update bitECS components
                // Note: In a real app, do this in a "System", not the render loop
                Position.x[id] = x;
                Position.y[id] = y;
                Velocity.x[id] = vx;
                Velocity.y[id] = vy;
            }
        }

        // 2. Draw Phase (Read from bitECS)
        const app = document.getElementById('app');
        if (app) {
            // We can query bitECS here, but for this demo we'll use the buffer 
            // to show we are reading from the synced state.
            let html = `
                <h1>Readable Engine Phase 3</h1>
                <p><strong>Status:</strong> ECS + Rust Binary Sync Active</p>
                <div style="position:relative; width:200px; height:200px; border:1px solid #0f0; background:#000;">
            `;

            // Query all entities with Position
            // (Using the buffer for easy iteration in this snippet, 
            // normally we would use bitECS query loop)
            if (buffer) {
                for (let i = 0; i < buffer.length; i += 5) {
                    const x = buffer[i + 1];
                    const y = buffer[i + 2];
                    html += `<div style="position:absolute; left:${x * 2}px; top:${y * 2}px; width:4px; height:4px; background:#0f0;"></div>`;
                }
            }

            html += `</div>`;
            app.innerHTML = html;
        }
    };

    const gameLoop = new GameLoop(bridge, render);
    gameLoop.start();
}

main();