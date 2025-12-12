import init, { Simulation } from "../../../core-sim/pkg/core_sim";

let wasmMemory: WebAssembly.Memory;

export class SimBridge {
    private sim: Simulation | null = null;
    private initialized = false;

    async init() {
        if (this.initialized) return;
        const wasmResult = await init();
        wasmMemory = wasmResult.memory;
        this.sim = new Simulation();
        this.initialized = true;
        console.log("🦀 Rust Core Initialized");
    }

    addAgent(id: number, x: number, y: number, radius: number, speed: number) {
        this.sim?.add_agent(id, x, y, radius, speed);
    }

    tick(inputsJson: string) {
        if (!this.sim) return;
        this.sim.tick(inputsJson);
    }

    /**
     * PRODUCTION FIX: Wasm memory can grow (resize). 
     * When it does, old ArrayBuffers become detached (length 0).
     * We must check and grab the new buffer if that happens.
     */
    getStateBuffer(): Float64Array | null {
        if (!this.sim) return null;

        const ptr = this.sim.get_state_ptr();
        const len = this.sim.get_state_len();

        if (len === 0) return new Float64Array(0);

        // Check for detached buffer
        if (wasmMemory.buffer.byteLength === 0) {
            // In a real scenario, we might need to re-fetch the memory export from the instance
            // But usually, wasmMemory.buffer updates automatically unless we held a ref to .buffer
            console.warn("Wasm memory detached!");
        }

        return new Float64Array(wasmMemory.buffer, ptr, len);
    }

    // --- SNAPSHOTS ---

    getSnapshot(): any {
        return this.sim?.get_snapshot();
    }

    loadSnapshot(data: any) {
        this.sim?.load_snapshot(data);
    }
}