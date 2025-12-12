import init, { Simulation } from "../../../core-sim/pkg/core_sim";

export class SimBridge {
    private sim: Simulation | null = null;
    private initialized = false;

    async init() {
        if (this.initialized) return;

        // Initialize the Wasm module
        await init();

        this.sim = new Simulation();
        this.initialized = true;
        console.log("🦀 Rust Core Initialized");
    }

    addEntity(id: number, x: number, y: number) {
        this.sim?.add_entity(id, x, y);
    }

    /**
     * Advances the simulation by exactly one tick.
     * @param inputsJson JSON string of inputs for this tick
     */
    tick(inputsJson: string) {
        if (!this.sim) return;
        this.sim.tick(inputsJson);
    }

    /**
     * Gets the current state for the renderer.
     */
    getState(): any[] {
        if (!this.sim) return [];
        const stateStr = this.sim.get_state();
        return JSON.parse(stateStr);
    }
}