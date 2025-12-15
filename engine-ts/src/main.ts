import { createWorld, defineQuery, addComponent, IWorld } from 'bitecs';
import { SimBridge } from "./core/SimBridge";
import { GameLoop } from "./core/GameLoop";
import { Hydrator } from "./core/Hydrator";
import { StateManager } from "./core/StateManager";
import { createSyncSystem } from "./systems/SyncSystem";
import { Position, Selectable } from "./ecs/components";
import { EntityDef } from './data/schema';

// Phase 4 Imports: Networking & Input
import { LocalAdapter } from './network/LocalAdapter';
import { GeckosAdapter } from './network/GeckosAdapter';
import { LockstepManager } from './network/LockstepManager';
import { InputManager } from './core/InputManager';
import { INetworkAdapter } from './network/types';

// --- DATA DEFINITIONS ---
// In a full implementation, these are loaded from JSON files in /game-data.
const UNITS: Record<string, EntityDef> = {
    "Marine": {
        name: "Marine",
        components: {
            Position: { x: 0, y: 0 },
            Health: { current: 50, max: 50 },
            UnitState: { state: "IDLE" },
            Physics: { radius: 0.5, max_speed: 0.5 }
        }
    }
};

async function main() {
    // 1. Initialize Wasm Bridge
    // This loads the Rust core and prepares shared memory.
    const bridge = new SimBridge();
    await bridge.init();

    // 2. Initialize ECS World & Systems
    const world = createWorld();
    const hydrator = new Hydrator(world, bridge);
    const stateManager = new StateManager(world, bridge);
    const syncSystem = createSyncSystem(bridge);

    // 3. Initialize Networking (Phase 4)
    // Check URL params for ?net=true to use real networking, otherwise use Local Virtual Server.
    const useRealNetwork = window.location.search.includes('net');

    let adapter: INetworkAdapter;
    if (useRealNetwork) {
        console.log("[Main] Mode: Multiplayer (Geckos.io)");
        // Ensure you have a Geckos server running on port 9208 if using this mode
        adapter = new GeckosAdapter('http://localhost', 9208);
    } else {
        console.log("[Main] Mode: Single Player (Virtual Server)");
        adapter = new LocalAdapter();
    }

    const lockstep = new LockstepManager(adapter, bridge);

    // Connect to the "network" (Virtual or Real)
    // This establishes the connection and starts listening for Ticks.
    await lockstep.init();

    // 4. Initialize Input Handling
    // Binds mouse events to the canvas and feeds the LockstepManager.
    const inputManager = new InputManager('game-canvas', world, lockstep);

    // 5. Setup UI (Buttons, HTML overlays)
    setupUI(stateManager, hydrator, world);

    // 6. Spawn Initial Units
    // Note: In a real networked game, initial units would be spawned via a "GameStart" command
    // processed by the LockstepManager to ensure all clients spawn them at the same tick.
    // For this demo, we spawn them locally to test the physics/rendering immediately.
    console.log("[Main] Spawning Squad...");
    for (let i = 0; i < 3; i++) {
        // Spawn a Marine
        const eid = hydrator.spawnEntity(UNITS["Marine"], { x: 10 + (i * 2), y: 10 });
        // Tag it as 'Selectable' so InputManager can interact with it
        addComponent(world, Selectable, eid);
    }

    // 7. Define Render Query
    // We only render entities that have a Position component.
    const renderQuery = defineQuery([Position]);

    // 8. Define the Render Function
    // This is called by the GameLoop inside requestAnimationFrame.
    const render = (alpha: number) => {
        // A. Sync Physics state from Wasm -> JS ECS
        syncSystem(world);

        // B. Draw the scene (Canvas 2D for debug, Three.js for prod)
        drawWorld(world, renderQuery, lockstep.getTick(), inputManager);
    };

    // 9. Start the Game Loop
    // The GameLoop manages the fixed timestep (15tps) and calls lockstep.update().
    const gameLoop = new GameLoop(bridge, lockstep, render);
    gameLoop.start();
}

/**
 * Sets up the HTML UI for testing.
 */
function setupUI(stateManager: StateManager, hydrator: Hydrator, world: IWorld) {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div style="margin-bottom: 10px; font-family: 'Segoe UI', monospace; background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px solid #333;">
            <div style="margin-bottom: 15px; color: #fff; font-size: 1.1em;">
                <strong>Readable Engine: Phase 4 (Networking & Lockstep)</strong>
            </div>
            <div style="color: #888; font-size: 0.9em; margin-bottom: 10px;">
                Left Click: Select Unit | Right Click: Move Unit
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="btn-marine" style="padding: 5px 10px; cursor: pointer; background: #004400; color: #afa; border: none;">+ Marine</button>
                <button id="btn-save" style="padding: 5px 10px; cursor: pointer; background: #444; color: #fff; border: none;">Save State</button>
            </div>
        </div>
        <canvas id="game-canvas" width="800" height="600" style="border: 1px solid #333; background: #000; display: block;"></canvas>
    `;

    // Prevent context menu on canvas (allows Right Click for movement)
    document.getElementById('game-canvas')?.addEventListener('contextmenu', e => e.preventDefault());

    // Spawn Button Logic
    document.getElementById('btn-marine')?.addEventListener('click', () => {
        const eid = hydrator.spawnEntity(UNITS["Marine"], {
            x: Math.random() * 80 + 10,
            y: Math.random() * 80 + 10
        });
        addComponent(world, Selectable, eid);
    });

    // Save State Logic (Debug)
    document.getElementById('btn-save')?.addEventListener('click', () => {
        const snap = stateManager.createSnapshot();
        console.log("Snapshot created:", snap);
        alert(`Snapshot created for Tick ${snap.sim.tick_count}. Check Console.`);
    });
}

/**
 * Simple 2D Canvas Renderer for debugging.
 */
function drawWorld(world: IWorld, query: (w: IWorld) => number[], tick: number, input: InputManager) {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Clear Screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const scale = 4; // 1 Sim Unit = 4 Pixels
    for (let i = 0; i < canvas.width; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
    for (let i = 0; i < canvas.height; i += 40) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
    ctx.stroke();

    // 3. Draw Entities
    const entities = query(world);

    // Access the selected ID (casting to any to bypass private visibility if strictly typed)
    const selectedId = (input as any).selectedEntityId;

    for (let i = 0; i < entities.length; i++) {
        const id = entities[i];
        const x = Position.x[id] * scale;
        const y = Position.y[id] * scale;

        // Draw Selection Circle
        if (selectedId === id) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw Unit Body
        ctx.fillStyle = '#0f0';
        ctx.fillRect(x - 3, y - 3, 6, 6);

        // Draw ID for debugging
        ctx.fillStyle = '#aaa';
        ctx.font = '10px monospace';
        ctx.fillText(`${id}`, x + 5, y - 5);
    }

    // 4. Draw HUD
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(`Sim Tick: ${tick}`, 10, 20);
    ctx.fillText(`Entities: ${entities.length}`, 10, 35);

    // Network Status
    const netMode = window.location.search.includes('net') ? "Geckos (Multi)" : "Local (Solo)";
    ctx.fillText(`Net: ${netMode}`, 10, 50);
}

main().catch(console.error);