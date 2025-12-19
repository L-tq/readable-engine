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

import { TitleScreen } from './renderer/TitleScreen';
import { MapSelectionScreen } from './renderer/MapSelectionScreen';
import { SettingsScreen } from './renderer/SettingsScreen';
import { ScenarioInfo } from './renderer/ScenarioList';

import { locales, LocaleKey } from './locales';

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

    // 2. Setup UI
    setupUI();

    // 3. Show Title Screen
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const titleScreen = new TitleScreen('game-canvas');
    titleScreen.start();

    // Setup Language Toggle
    let currentLang = 'en';
    const updateText = (lang: string) => {
        const t = locales[lang];
        document.getElementById('title-text')!.innerText = t.title;
        document.getElementById('start-btn')!.innerText = t.play_button;
        document.getElementById('settings-btn')!.innerText = t.settings_button;
        document.getElementById('subtitle-text')!.innerText = `${t.subtitle} | v0.3.0`;
        document.getElementById('debug-info')!.innerText = t.vibe_mode;

        // Update overlay
        const uiLayerTitle = document.querySelector('#ui-layer strong');
        if (uiLayerTitle) uiLayerTitle.textContent = t.title;
    };

    // 4. Setup Menus
    const startBtn = document.getElementById('start-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const titleUi = document.getElementById('title-ui');

    if (startBtn && settingsBtn && titleUi) {
        // Init text
        updateText(currentLang);

        const onStartScenario = (scenario: ScenarioInfo) => {
            // Fade out title
            titleUi.style.opacity = '0';
            titleUi.style.pointerEvents = 'none'; // Disable interactions
            mapSelectionScreen.hide();
            titleScreen.stop();
            runInteractive(isNetworked, scenario.path);
        };

        const mapSelectionScreen = new MapSelectionScreen(
            onStartScenario,
            () => { // On Back
                // Show title UI again
                mapSelectionScreen.hide();
                titleUi.style.opacity = '1';
                // Re-enable pointer events for the buttons inside title-ui
                const buttons = titleUi.querySelectorAll('button');
                buttons.forEach(b => (b as HTMLElement).style.pointerEvents = 'auto');
            }
        );

        const settingsScreen = new SettingsScreen(
            () => { // On Back
                settingsScreen.hide();
                titleUi.style.opacity = '1';
                const buttons = titleUi.querySelectorAll('button');
                buttons.forEach(b => (b as HTMLElement).style.pointerEvents = 'auto');
            },
            (lang: string) => { // On Language Change
                currentLang = lang;
                updateText(currentLang);
                mapSelectionScreen.setLanguage(lang);
                settingsScreen.setLanguage(lang);
            }
        );

        startBtn.onclick = () => {
            // Hide title UI but keep background running
            titleUi.style.opacity = '0';
            // Disable pointer events on the container so we can click the new screen
            const buttons = titleUi.querySelectorAll('button');
            buttons.forEach(b => (b as HTMLElement).style.pointerEvents = 'none');

            mapSelectionScreen.show();
        };

        settingsBtn.onclick = () => {
            titleUi.style.opacity = '0';
            const buttons = titleUi.querySelectorAll('button');
            buttons.forEach(b => (b as HTMLElement).style.pointerEvents = 'none');

            settingsScreen.show();
        };
    }
}

async function runInteractive(useRealNetwork: boolean, scenarioUrl: string) {
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

    // INJECT HTML including the Selection Box & Title Screen
    app.innerHTML = `
        <!-- TITLE SCREEN OVERLAY -->
        <div id="title-ui" style="
            position: absolute; 
            top: 0; left: 0; width: 100vw; height: 100vh;
            display: flex; flex-direction: column; 
            align-items: center; 
            justify-content: space-between; /* Pushes content to edges */
            padding: 4rem 0; /* Add breathing room top/bottom */
            box-sizing: border-box;
            z-index: 50; 
            transition: opacity 1s ease;
            pointer-events: none; /* Allows clicks to pass through empty areas to 3D scene */
        ">
            
            <!-- TOP SECTION: Title -->
            <div style="text-align: center; pointer-events: auto;">
                <h1 id="title-text" style="
                    color: #fff; font-family: 'Segoe UI', sans-serif; font-size: 5rem; 
                    text-shadow: 0 0 20px rgba(0,255,100,0.5); margin: 0;
                    letter-spacing: 5px; text-transform: uppercase;
                ">Readable Engine</h1>
            </div>
            
            <!-- MIDDLE SECTION: Empty to show Voxel Model -->
            <div style="flex-grow: 1;"></div>

            <!-- BOTTOM SECTION: Buttons -->
            <div style="display: flex; flex-direction: column; gap: 1rem; pointer-events: auto; padding-bottom: 2rem;">
                <button id="start-btn" style="
                    background: rgba(0, 255, 100, 0.2);
                    border: 2px solid #0f0;
                    color: #fff;
                    font-family: monospace;
                    font-size: 1.5rem;
                    padding: 1rem 3rem;
                    cursor: pointer;
                    backdrop-filter: blur(10px);
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    transition: all 0.2s ease;
                    box-shadow: 0 0 15px rgba(0,255,0,0.2);
                " 
                onmouseover="this.style.background='rgba(0,255,100,0.4)'; this.style.transform='scale(1.05)';" 
                onmouseout="this.style.background='rgba(0,255,100,0.2)'; this.style.transform='scale(1)';"
                >
                    PLAY
                </button>
                <button id="settings-btn" style="
                    background: rgba(0, 100, 255, 0.2);
                    border: 2px solid #00f;
                    color: #fff;
                    font-family: monospace;
                    font-size: 1.2rem;
                    padding: 1rem 3rem;
                    cursor: pointer;
                    backdrop-filter: blur(10px);
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    transition: all 0.2s ease;
                    box-shadow: 0 0 15px rgba(0,100,255,0.2);
                " 
                onmouseover="this.style.background='rgba(0,100,255,0.4)'; this.style.transform='scale(1.05)';" 
                onmouseout="this.style.background='rgba(0,100,255,0.2)'; this.style.transform='scale(1)';"
                >
                    SETTINGS
                </button>
                <div id="subtitle-text" style="margin-top: 10px; color: #888; font-family: monospace;">Deterministic Core | v0.3.0</div>
            </div>
        </div>

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