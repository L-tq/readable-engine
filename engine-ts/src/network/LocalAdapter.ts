// engine-ts/src/network/LocalAdapter.ts

import { INetworkAdapter, InputCommand, TickBundle } from "./types";

/**
 * A Virtual Server running locally.
 * Simulates network latency and authoritative tick generation.
 */
export class LocalAdapter implements INetworkAdapter {
    peerId = "Host_Local";
    private isConnected = false;
    private bundleCallback: ((bundle: TickBundle) => void) | null = null;

    // Server State
    private serverTick = 0;
    private serverBuffer = new Map<number, InputCommand[]>();
    private intervalId: any = null;

    // Configuration
    private readonly TICK_RATE = 15;
    private readonly MS_PER_TICK = 1000 / 15;
    private readonly SIMULATED_LATENCY_MS = 20; // Simulate 20ms ping

    async connect(): Promise<boolean> {
        console.log("[LocalAdapter] Starting Virtual Server...");
        this.isConnected = true;
        this.serverTick = 0;
        this.serverBuffer.clear();

        // Start the Server Heartbeat
        this.intervalId = setInterval(() => this.serverLoop(), this.MS_PER_TICK);

        return Promise.resolve(true);
    }

    sendInput(tick: number, commands: InputCommand[]): void {
        if (!this.isConnected) return;

        // Simulate Network Latency (Client -> Server)
        setTimeout(() => {
            // Server Logic: Receive Input
            // In a real server, we would validate the tick here.
            // If tick < serverTick, the input is too late and rejected.

            const current = this.serverBuffer.get(tick) || [];
            // Merge commands
            this.serverBuffer.set(tick, current.concat(commands));
        }, this.SIMULATED_LATENCY_MS);
    }

    onInputBundle(callback: (bundle: TickBundle) => void): void {
        this.bundleCallback = callback;
    }

    disconnect(): void {
        this.isConnected = false;
        if (this.intervalId) clearInterval(this.intervalId);
        console.log("[LocalAdapter] Virtual Server Stopped.");
    }

    /**
     * The Authoritative Server Loop.
     * Broadcasts a bundle for the current tick, then increments time.
     */
    private serverLoop() {
        if (!this.isConnected) return;

        // 1. Get commands for this tick (or empty array)
        const commands = this.serverBuffer.get(this.serverTick) || [];

        // 2. Create Bundle
        const bundle: TickBundle = {
            tick: this.serverTick,
            commands: commands
        };

        // 3. Broadcast to Client (Simulate Network Latency Server -> Client)
        setTimeout(() => {
            if (this.bundleCallback) {
                this.bundleCallback(bundle);
            }
        }, this.SIMULATED_LATENCY_MS);

        // 4. Cleanup Memory
        this.serverBuffer.delete(this.serverTick);

        // 5. Advance Server Time
        this.serverTick++;
    }
}