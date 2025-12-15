import { LockstepManager } from "../network/LockstepManager";
import { SimBridge } from "./SimBridge";

export class GameLoop {
    private lastTime: number = 0;
    private accumulator: number = 0;

    // 15 Ticks Per Second
    private readonly TICK_RATE = 15;
    private readonly STEP = 1000 / this.TICK_RATE;

    constructor(
        private sim: SimBridge,
        private lockstep: LockstepManager,
        private renderer: (alpha: number) => void
    ) { }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    private loop(currentTime: number) {
        const frameTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Cap frame time to prevent "spiral of death"
        this.accumulator += Math.min(frameTime, 250);

        // --- DETERMINISTIC UPDATE ---
        while (this.accumulator >= this.STEP) {
            // Try to advance the simulation via Lockstep
            const advanced = this.lockstep.update();

            if (advanced) {
                // If we successfully ticked, consume time
                this.accumulator -= this.STEP;
            } else {
                // STARVATION: The network packet hasn't arrived yet.
                // We stop consuming the accumulator (effectively pausing time)
                // until data arrives.
                break;
            }
        }

        // --- RENDER INTERPOLATION ---
        const alpha = this.accumulator / this.STEP;
        this.renderer(alpha);

        requestAnimationFrame((t) => this.loop(t));
    }
}