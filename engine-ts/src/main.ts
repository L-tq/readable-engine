import { createWorld, defineQuery, IWorld } from 'bitecs';
import { SimBridge } from "./core/SimBridge";
import { GameLoop } from "./core/GameLoop";
import { Hydrator } from "./core/Hydrator";
import { StateManager } from "./core/StateManager";
import { createSyncSystem } from "./systems/SyncSystem";
import { Position } from "./ecs/components";
import { EntityDef } from './data/schema';

// --- DATA DEFINITIONS (The "Vibe" Layer) ---
// In a full app, these would be loaded from JSON files in /game-data
const UNITS: Record<string, EntityDef> = {
    "Marine": {
        name: "Marine",
        components: {
            Position: { x: 0, y: 0 },
            Health: { current: 50, max: 50 },
            UnitState: { state: "IDLE" },
            Physics: { radius: 0.5, max_speed: 0.5 } // Fast, small
        }
    },
    "Tank": {
        name: "Tank",
        components: {
            Position: { x: 0, y: 0 },
            Health: { current: 150, max: 150 },
            UnitState: { state: "IDLE" },
            Physics: { radius: 0.8, max_speed: 0.25 } // Slow, big
        }
    }
};

async function main() {
    // 1. Initialize the Wasm Bridge
    const bridge = new SimBridge();
    await bridge.init();

    // 2. Initialize ECS and Managers
    const world = createWorld();
    const hydrator = new Hydrator(world, bridge);
    const stateManager = new StateManager(world, bridge);
    const syncSystem = createSyncSystem(bridge);

    // 3. Setup UI for Vibe Coding / Debugging
    setupUI(stateManager, hydrator);

    // 4. Initial Spawn (Create a Squad)
    console.log("[Main] Spawning initial squad...");
    for (let i = 0; i < 5; i++) {
        // Spawn Marines in a line
        hydrator.spawnEntity(UNITS["Marine"], { x: 10 + (i * 2), y: 10 });
    }

    // 5. Send Initial Command (Move to center)
    // Note: In a real game, this happens via the Network/Input system
    const initialCmd = JSON.stringify([{
        id: 0, // Note: This ID is brittle! In a real engine, we select by Entity ID dynamically.
        action: "MOVE",
        target_x: 50,
        target_y: 50,
        mode: "FLOW"
    }]);
    bridge.tick(initialCmd);

    // 6. Setup Rendering
    // Query all entities that have a Position (and thus are visible)
    const renderQuery = defineQuery([Position]);

    const render = (alpha: number) => {
        // A. Sync Physics State (Rust -> JS)
        syncSystem(world);

        // B. Draw
        drawWorld(world, renderQuery);
    };

    // 7. Start Game Loop
    const gameLoop = new GameLoop(bridge, render);
    gameLoop.start();
}

/**
 * Sets up the HTML UI for testing Phase 3 features.
 */
function setupUI(stateManager: StateManager, hydrator: Hydrator) {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div style="margin-bottom: 10px; font-family: 'Segoe UI', monospace; background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px solid #333;">
            <div style="margin-bottom: 15px; color: #fff; font-size: 1.1em;">
                <strong>Readable Engine: Phase 3 (State & Data)</strong>
            </div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <button id="btn-save" style="padding: 8px 12px; cursor: pointer; background: #333; color: white; border: 1px solid #555;">💾 Save Snapshot</button>
                <button id="btn-load" style="padding: 8px 12px; cursor: pointer; background: #333; color: white; border: 1px solid #555;">📂 Load Snapshot</button>
            </div>
            
            <div style="display: flex; gap: 10px; align-items: center;">
                <button id="btn-marine" style="padding: 5px 10px; cursor: pointer; background: #004400; color: #afa; border: none;">+ Marine</button>
                <button id="btn-tank" style="padding: 5px 10px; cursor: pointer; background: #000044; color: #aaf; border: none;">+ Tank</button>
                <span id="status" style="margin-left: auto; color: #888; font-size: 0.9em;">System Ready</span>
            </div>
        </div>
        <canvas id="game-canvas" width="800" height="600" style="border: 1px solid #333; background: #000; display: block;"></canvas>
    `;

    let savedState: any = null;
    const status = document.getElementById('status')!;

    // SAVE
    document.getElementById('btn-save')?.addEventListener('click', () => {
        savedState = stateManager.createSnapshot();
        console.log("State Saved:", savedState);
        status.innerText = `Saved ${savedState.ecs.entities.length} entities @ T=${savedState.timestamp}`;
        status.style.color = '#4f4';
    });

    // LOAD
    document.getElementById('btn-load')?.addEventListener('click', () => {
        if (savedState) {
            stateManager.loadSnapshot(savedState);
            status.innerText = "State Loaded & IDs Remapped";
            status.style.color = '#4f4';
        } else {
            status.innerText = "No save in memory";
            status.style.color = '#f44';
        }
    });

    // SPAWN MARINE
    document.getElementById('btn-marine')?.addEventListener('click', () => {
        hydrator.spawnEntity(UNITS["Marine"], {
            x: Math.random() * 80 + 10,
            y: Math.random() * 80 + 10
        });
    });

    // SPAWN TANK
    document.getElementById('btn-tank')?.addEventListener('click', () => {
        hydrator.spawnEntity(UNITS["Tank"], {
            x: Math.random() * 80 + 10,
            y: Math.random() * 80 + 10
        });
    });
}

/**
 * Simple 2D Canvas Renderer for debugging.
 */
function drawWorld(world: IWorld, query: (w: IWorld) => number[]) {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (every 40 units)
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const scale = 4; // Visual scale (1 sim unit = 4 pixels)

    for (let i = 0; i < canvas.width; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
    for (let i = 0; i < canvas.height; i += 40) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
    ctx.stroke();

    // Draw Entities
    const entities = query(world);

    for (let i = 0; i < entities.length; i++) {
        const id = entities[i];

        // Get Position (Synced from Rust)
        const x = Position.x[id] * scale;
        const y = Position.y[id] * scale;

        // Draw Unit Body
        ctx.fillStyle = '#0f0';
        ctx.fillRect(x - 3, y - 3, 6, 6);

        // Draw Debug Info (ID)
        // This is crucial to verify that ID remapping works. 
        // If IDs desync, the box will move but the text might stay or flicker.
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText(`${id}`, x + 5, y - 5);
    }
}

main().catch(console.error);