import { createWorld } from 'bitecs';
import { SimBridge } from "./core/SimBridge";
import { GameLoop } from "./core/GameLoop";
import { Hydrator } from "./core/Hydrator";
import { StateManager } from "./core/StateManager";
import { createSyncSystem } from "./systems/SyncSystem";
import { LocalAdapter } from './network/LocalAdapter';
import { GeckosAdapter } from './network/GeckosAdapter';
import { LockstepManager } from './network/LockstepManager';
import { InputManager } from './core/InputManager';
import { INetworkAdapter } from './network/types';
import { GameRenderer } from './renderer/GameRenderer';
import { ErrorReporter } from './core/ErrorReporter';
import { HeadlessRunner } from './core/HeadlessRunner';
import { ASCIIMapParser } from './utils/ASCIIMapParser';
import { DataManager } from './data/DataManager';
import { CameraManager } from './core/CameraManager';

async function main() {
    // 0. Init Data Layer
    const dataManager = DataManager.getInstance();
    await dataManager.loadUnits();

    // 1. Parse URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const isHeadless = urlParams.has('headless');
    const isNetworked = urlParams.has('net');
    const scenarioUrl = urlParams.get('scenario') || '/game-data/scenarios/zerg_rush.json';

    if (isHeadless) {
        await runHeadless(scenarioUrl);
        return;
    }

    await runInteractive(isNetworked, scenarioUrl);
}

async function runInteractive(useRealNetwork: boolean, scenarioUrl: string) {
    // Setup UI first so elements exist for Renderers/InputManagers
    setupUI();

    const bridge = new SimBridge();
    await bridge.init();

    const world = createWorld();
    ErrorReporter.init(world);

    const hydrator = new Hydrator(world, bridge);
    const stateManager = new StateManager(world, bridge);
    const syncSystem = ErrorReporter.wrapSystem("SyncSystem", createSyncSystem(bridge));

    const renderer = new GameRenderer('game-canvas');
    const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement;
    const cameraManager = new CameraManager(renderer.camera, canvasEl);

    let adapter: INetworkAdapter;
    if (useRealNetwork) {
        adapter = new GeckosAdapter('http://localhost', 9208);
    } else {
        adapter = new LocalAdapter();
    }
    const lockstep = new LockstepManager(adapter, bridge);
    await lockstep.init();

    // Input Manager needs the selection-box element to exist now
    const inputManager = new InputManager('game-canvas', world, lockstep, renderer);

    console.log(`[Main] Loading Scenario: ${scenarioUrl}`);
    const scenario = await DataManager.getInstance().loadScenario(scenarioUrl);

    if (scenario) {
        const mapParser = new ASCIIMapParser(hydrator);
        const result = mapParser.parse(scenario.map.grid, scenario.map.legend);
        cameraManager.setBounds(result.bounds);
    } else {
        console.error("Failed to load scenario.");
    }

    const render = (alpha: number) => {
        try {
            cameraManager.update();
            syncSystem(world);
            inputManager.update();
            renderer.render(world, alpha);
        } catch (e) {
            throw e;
        }
    };

    const gameLoop = new GameLoop(bridge, lockstep, render);
    gameLoop.start();
}

async function runHeadless(scenarioUrl: string) {
    const runner = new HeadlessRunner();
    await runner.init();

    const scenario = await DataManager.getInstance().loadScenario(scenarioUrl);
    if (!scenario) return;

    const result = await runner.runScenario(scenario);

    const output = document.createElement('pre');
    output.style.color = '#0f0';
    output.style.padding = '20px';
    output.textContent = JSON.stringify(result, null, 2);
    document.body.appendChild(output);
}

function setupUI() {
    const app = document.getElementById('app');
    if (!app) return;

    // INJECT HTML including the Selection Box
    app.innerHTML = `
        <div id="ui-layer" style="position: absolute; top: 10px; left: 10px; color: white; font-family: monospace; pointer-events: none; z-index: 10;">
            <strong>Readable Engine</strong><br>
            <span id="debug-info">Vibe Mode Active</span>
        </div>
        
        <!-- SELECTION BOX -->
        <div id="selection-box" style="
            position: absolute;
            border: 1px solid #0f0;
            background-color: rgba(0, 255, 0, 0.2);
            pointer-events: none;
            display: none;
            z-index: 20;
        "></div>

        <canvas id="game-canvas"></canvas>
    `;

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    canvas.style.display = 'block';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
}

main().catch(console.error);