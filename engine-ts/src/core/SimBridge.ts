import init, { Simulation } from "../../../core-sim/pkg/core_sim";

// We need to access the WASM memory buffer directly
// vite-plugin-wasm usually exposes the instance, or we can grab it from the init result
let wasmMemory: WebAssembly.Memory;

export class SimBridge {
    private sim: Simulation | null = null;
    private initialized = false;

    async init() {
        if (this.initialized) return;
        const wasmResult = await init();
        wasmMemory = wasmResult.memory; // Grab memory reference

        this.sim = new Simulation();
        this.initialized = true;
        console.log("🦀 Rust Core Initialized (Binary Mode)");
    }

    addAgent(id: number, x: number, y: number, radius: number, speed: number) {
        this.sim?.add_agent(id, x, y, radius, speed);
    }

    tick(inputsJson: string) {
        if (!this.sim) return;
        this.sim.tick(inputsJson);
    }

    /**
     * Reads the raw Float64Array from Wasm memory.
     * Returns a view, not a copy (mostly).
     */
    getStateBuffer(): Float64Array | null {
        if (!this.sim) return null;

        const ptr = this.sim.get_state_ptr();
        const len = this.sim.get_state_len();

        // Create a view into the WASM memory
        // Note: This view is valid only until the next WASM allocation (tick)
        return new Float64Array(wasmMemory.buffer, ptr, len);
    }
}