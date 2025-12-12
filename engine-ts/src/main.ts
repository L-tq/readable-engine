import { createWorld, defineQuery, IWorld } from 'bitecs';
import { SimBridge } from "./core/SimBridge";
import { GameLoop } from "./core/GameLoop";
import { Hydrator } from "./core/Hydrator";
import { StateManager } from "./core/StateManager";
import { createSyncSystem } from "./systems/SyncSystem";
import { Position } from "./ecs/components";

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
    const bridge = new SimBridge();
    await bridge.init();

    const world = createWorld();
    const hydrator = new Hydrator(world, bridge);
    const stateManager = new StateManager(world, bridge);
    const syncSystem = createSyncSystem(bridge);

    // Setup UI
    setupUI(stateManager);

    // Spawn Units
    console.log("Creating units...");
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            hydrator.spawnEntity(MARINE_DEF, { x: 10 + (i * 2), y: 10 + (j * 2) });
        }
    }

    // Initial Command
    const initialCmd = JSON.stringify([{
        id: 0,
        action: "MOVE",
        target_x: 50,
        target_y: 50,
        mode: "FLOW"
    }]);
    bridge.tick(initialCmd);

    // Create a Query for rendering
    // This efficiently finds all entities with a Position component
    const renderQuery = defineQuery([Position]);

    const render = (alpha: number) => {
        // 1. Sync Rust State -> JS ECS
        syncSystem(world);

        // 2. Render
        drawWorld(world, renderQuery);
    };

    const gameLoop = new GameLoop(bridge, render);
    gameLoop.start();
}

function setupUI(stateManager: StateManager) {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div style="margin-bottom: 10px; font-family: sans-serif;">
            <div style="margin-bottom: 5px;">
                <strong>Readable Engine: Phase 3 (State & Data)</strong>
            </div>
            <button id="btn-save">💾 Save Snapshot</button>
            <button id="btn-load">📂 Load Snapshot</button>
            <button id="btn-add">➕ Add Random Unit</button>
            <span id="status" style="margin-left: 10px; color: #888;">System Ready</span>
        </div>
        <canvas id="game-canvas" width="600" height="400" style="border: 1px solid #333; background: #000;"></canvas>
    `;

    let savedState: any = null;
    const status = document.getElementById('status')!;

    document.getElementById('btn-save')?.addEventListener('click', () => {
        savedState = stateManager.createSnapshot();
        console.log("State Saved:", savedState);
        status.innerText = `Saved ${savedState.ecs.entities.length} entities @ T=${savedState.timestamp}`;
        status.style.color = '#0f0';
    });

    document.getElementById('btn-load')?.addEventListener('click', () => {
        if (savedState) {
            stateManager.loadSnapshot(savedState);
            status.innerText = "State Loaded";
            status.style.color = '#0f0';
        } else {
            status.innerText = "No save found";
            status.style.color = '#f00';
        }
    });
}

function drawWorld(world: IWorld, query: (w: IWorld) => number[]) {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = '#222';
    ctx.beginPath();
    for (let i = 0; i < 600; i += 20) { ctx.moveTo(i, 0); ctx.lineTo(i, 400); }
    for (let i = 0; i < 400; i += 20) { ctx.moveTo(0, i); ctx.lineTo(600, i); }
    ctx.stroke();

    ctx.fillStyle = '#0f0';

    // Execute Query to get active entity IDs
    const entities = query(world);

    for (let i = 0; i < entities.length; i++) {
        const id = entities[i];
        const x = Position.x[id] * 4; // Scale for visibility
        const y = Position.y[id] * 4;

        ctx.fillRect(x - 2, y - 2, 4, 4);

        // Optional: Draw ID for debugging
        // ctx.fillStyle = '#fff';
        // ctx.fillText(id.toString(), x + 5, y);
        // ctx.fillStyle = '#0f0';
    }
}

main();