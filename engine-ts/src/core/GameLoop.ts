import { SimBridge } from "./SimBridge";

export class GameLoop {
    private lastTime: number = 0;
    private accumulator: number = 0;

    // 15 Ticks Per Second = ~66.66ms per tick
    private readonly TICK_RATE = 15;
    private readonly STEP = 1000 / this.TICK_RATE;

    constructor(private sim: SimBridge, private renderer: (alpha: number, state: any) => void) { }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    private loop(currentTime: number) {
        const frameTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Cap frame time to prevent "spiral of death" if browser hangs
        // (If lag is > 250ms, just simulate 250ms worth)
        this.accumulator += Math.min(frameTime, 250);

        // --- DETERMINISTIC UPDATE ---
        // Consume the accumulated time in fixed chunks
        while (this.accumulator >= this.STEP) {
            // In a real netcode scenario, we would fetch inputs from a buffer here
            const dummyInput = JSON.stringify([]);
            this.sim.tick(dummyInput);

            this.accumulator -= this.STEP;
        }

        // --- RENDER INTERPOLATION ---
        // alpha represents how far we are between the previous tick and the next tick (0.0 to 1.0)
        // Used for smooth visual interpolation
        const alpha = this.accumulator / this.STEP;
        const currentState = this.sim.getState();

        this.renderer(alpha, currentState);

        requestAnimationFrame((t) => this.loop(t));
    }
}