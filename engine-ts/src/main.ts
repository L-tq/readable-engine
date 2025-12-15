import { createWorld, addComponent } from 'bitecs';
import { SimBridge } from "./core/SimBridge";
import { GameLoop } from "./core/GameLoop";
import { Hydrator } from "./core/Hydrator";
import { StateManager } from "./core/StateManager";
import { createSyncSystem } from "./systems/SyncSystem";
import { Selectable, Renderable } from "./ecs/components";
import { EntityDef } from './data/schema';
import { LocalAdapter } from './network/LocalAdapter';
import { GeckosAdapter } from './network/GeckosAdapter';
import { LockstepManager } from './network/LockstepManager';
import { InputManager } from './core/InputManager';
import { INetworkAdapter } from './network/types';
import { GameRenderer } from './renderer/GameRenderer';
import { Assets } from './renderer/AssetManager';

// --- DATA DEFINITIONS ---
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
    // 1. Init Wasm
    const bridge = new SimBridge();
    await bridge.init();

    // 2. Init ECS
    const world = createWorld();
    const hydrator = new Hydrator(world, bridge);
    const stateManager = new StateManager(world, bridge);
    const syncSystem = createSyncSystem(bridge);

    // 3. Setup UI (Create DOM/Canvas FIRST)
    // MOVED UP: This must run before Renderer/InputManager
    setupUI(stateManager, hydrator, world);

    // 4. Init Renderer
    // Now 'game-canvas' exists in the DOM
    const renderer = new GameRenderer('game-canvas');

    // 5. Init Networking
    const useRealNetwork = window.location.search.includes('net');
    let adapter: INetworkAdapter;
    if (useRealNetwork) {
        adapter = new GeckosAdapter('http://localhost', 9208);
    } else {
        adapter = new LocalAdapter();
    }
    const lockstep = new LockstepManager(adapter, bridge);
    await lockstep.init();

    // 6. Init Input
    const inputManager = new InputManager('game-canvas', world, lockstep, renderer);

    // 7. Spawn Initial Units
    console.log("[Main] Spawning Squad...");
    for (let i = 0; i < 50; i++) {
        const eid = hydrator.spawnEntity(UNITS["Marine"], {
            x: (Math.random() * 40) - 20,
            y: (Math.random() * 40) - 20
        });

        addComponent(world, Selectable, eid);
        addComponent(world, Renderable, eid);
        Renderable.modelId[eid] = Assets.getModelId("Marine");
    }

    // 8. Render Loop
    const render = (alpha: number) => {
        syncSystem(world);
        inputManager.update();
        renderer.render(world, alpha);
    };

    // 9. Start Loop
    const gameLoop = new GameLoop(bridge, lockstep, render);
    gameLoop.start();
}

function setupUI(stateManager: StateManager, hydrator: Hydrator, world: unknown) {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div style="position: absolute; top: 10px; left: 10px; color: white; font-family: monospace; pointer-events: none; z-index: 10;">
            <strong>Readable Engine: Phase 5 (Renderer)</strong><br>
            Left Click: Select | Right Click: Move<br>
            <span id="debug-info"></span>
        </div>
        <canvas id="game-canvas"></canvas>
    `;

    // CSS to make canvas full screen
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    canvas.style.display = 'block';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';

    // Fix for high-DPI displays (blurriness)
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Prevent context menu on canvas
    canvas.addEventListener('contextmenu', e => e.preventDefault());
}

main().catch(console.error);