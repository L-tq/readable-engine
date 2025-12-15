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

async function main() {
    // 0. Init Data Layer
    const dataManager = DataManager.getInstance();
    await dataManager.loadUnits(); // Load 'game-data/units.json'

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
    const bridge = new SimBridge();
    await bridge.init();

    const world = createWorld();
    ErrorReporter.init(world);

    const hydrator = new Hydrator(world, bridge);
    const stateManager = new StateManager(world, bridge);
    const syncSystem = ErrorReporter.wrapSystem("SyncSystem", createSyncSystem(bridge));

    setupUI();
    const renderer = new GameRenderer('game-canvas');

    let adapter: INetworkAdapter;
    if (useRealNetwork) {
        adapter = new GeckosAdapter('http://localhost', 9208);
    } else {
        adapter = new LocalAdapter();
    }
    const lockstep = new LockstepManager(adapter, bridge);
    await lockstep.init();

    const inputManager = new InputManager('game-canvas', world, lockstep, renderer);

    // --- LOAD SCENARIO ---
    console.log(`[Main] Loading Scenario: ${scenarioUrl}`);
    const scenario = await DataManager.getInstance().loadScenario(scenarioUrl);

    if (scenario) {
        const mapParser = new ASCIIMapParser(hydrator);
        mapParser.parse(scenario.map.grid, scenario.map.legend);
    } else {
        console.error("Failed to load scenario. Starting empty world.");
    }

    const render = (alpha: number) => {
        try {
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
    if (!scenario) {
        document.body.innerText = "Error: Could not load scenario JSON.";
        return;
    }

    const result = await runner.runScenario(scenario);

    // Display Result for Vibe Coding / LLM
    const output = document.createElement('pre');
    output.style.color = '#0f0';
    output.style.padding = '20px';
    output.textContent = JSON.stringify(result, null, 2);
    document.body.appendChild(output);
}

function setupUI() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div style="position: absolute; top: 10px; left: 10px; color: white; font-family: monospace; pointer-events: none; z-index: 10;">
            <strong>Readable Engine</strong><br>
            <span id="debug-info">Vibe Mode Active</span>
        </div>
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