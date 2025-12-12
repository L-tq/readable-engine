import { SimBridge } from "./core/SimBridge";
import { GameLoop } from "./core/GameLoop";

async function main() {
    const bridge = new SimBridge();
    await bridge.init();

    // Spawn a crowd
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            bridge.addEntity(i * 10 + j, 10 + i, 10 + j);
        }
    }

    // Send a move command to the center using Flow Fields
    // This simulates a "Tick 1" input
    const initialCmd = JSON.stringify([{
        id: 0,
        action: "MOVE",
        target_x: 50,
        target_y: 50,
        mode: "FLOW"
    }]);

    bridge.tick(initialCmd);

    const render = (alpha: number, state: any) => {
        const app = document.getElementById('app');
        if (app) {
            // Visualizing the first unit for brevity
            const u = state[0];
            app.innerHTML = `
                <h1>Readable Engine Phase 2</h1>
                <p><strong>Systems Active:</strong> FlowField + RVO + NavMesh</p>
                <p>Unit 0 Pos: (${u.x.toFixed(2)}, ${u.y.toFixed(2)})</p>
                <p>Unit 0 Vel: (${u.vel_x.toFixed(2)}, ${u.vel_y.toFixed(2)})</p>
                <div style="position:relative; width:200px; height:200px; border:1px solid #0f0; background:#000;">
                    ${state.map((s: any) =>
                `<div style="position:absolute; left:${s.x * 2}px; top:${s.y * 2}px; width:4px; height:4px; background:#0f0;"></div>`
            ).join('')}
                </div>
            `;
        }
    };

    const gameLoop = new GameLoop(bridge, render);
    gameLoop.start();
}

main();