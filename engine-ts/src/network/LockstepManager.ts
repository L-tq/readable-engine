import { INetworkAdapter, InputCommand, TickBundle } from "./types";
import { SimBridge } from "../core/SimBridge";

export class LockstepManager {
    // Configuration
    private readonly SEND_DELAY_TICKS = 3; // Delay inputs by 3 ticks (approx 200ms at 15tps)
    private readonly BUFFER_SIZE = 3;

    // State
    private currentTick = 0;
    private inputBuffer = new Map<number, InputCommand[]>();
    private pendingLocalInputs: InputCommand[] = [];
    private connected = false;

    constructor(
        private adapter: INetworkAdapter,
        private sim: SimBridge
    ) { }

    async init() {
        // Bind listener before connecting
        this.adapter.onInputBundle((bundle) => this.onBundleReceived(bundle));

        const success = await this.adapter.connect();
        if (success) {
            this.connected = true;
            console.log("[LockstepManager] Network Initialized. Waiting for Tick 0...");
        } else {
            console.error("[LockstepManager] Failed to connect to network.");
        }
    }

    queueCommand(cmd: InputCommand) {
        this.pendingLocalInputs.push(cmd);
    }

    private onBundleReceived(bundle: TickBundle) {
        // Store inputs. 
        // Note: The server sends us the bundle for tick N.
        // We can only execute tick N when we have this bundle.

        // If we receive a bundle for a tick way in the past, ignore it.
        if (bundle.tick < this.currentTick) {
            // console.warn(`[Lockstep] Received stale bundle for Tick ${bundle.tick}. Current: ${this.currentTick}`);
            return;
        }

        const existing = this.inputBuffer.get(bundle.tick) || [];
        // In a real optimized engine, we might check for duplicates here
        this.inputBuffer.set(bundle.tick, existing.concat(bundle.commands));
    }

    /**
     * The heartbeat of the game loop.
     * Returns TRUE if we successfully advanced a tick.
     */
    update(): boolean {
        if (!this.connected) return false;

        // 1. Send Local Inputs for a FUTURE tick
        if (this.pendingLocalInputs.length > 0) {
            const targetTick = this.currentTick + this.SEND_DELAY_TICKS;
            // console.log(`[Lockstep] Sending ${this.pendingLocalInputs.length} cmds for Tick ${targetTick}`);
            this.adapter.sendInput(targetTick, [...this.pendingLocalInputs]);
            this.pendingLocalInputs = [];
        }

        // 2. Check for Data
        const inputs = this.inputBuffer.get(this.currentTick);

        if (!inputs) {
            // STARVATION: We cannot proceed without the server's confirmation for this tick.
            // Even an empty array [] is valid data. undefined means "packet not arrived".
            return false;
        }

        // 3. Execute Tick
        const json = JSON.stringify(inputs);
        this.sim.tick(json);

        // 4. Cleanup
        this.inputBuffer.delete(this.currentTick);
        this.currentTick++;

        return true;
    }

    public getTick() {
        return this.currentTick;
    }
}