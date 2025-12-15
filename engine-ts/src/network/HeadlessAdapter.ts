import { INetworkAdapter, InputCommand, TickBundle } from "./types";

export class HeadlessAdapter implements INetworkAdapter {
    peerId = "HEADLESS_HOST";
    private bundleCallback: ((bundle: TickBundle) => void) | null = null;
    private buffer = new Map<number, InputCommand[]>();

    connect(): Promise<boolean> {
        return Promise.resolve(true);
    }

    sendInput(tick: number, commands: InputCommand[]): void {
        const current = this.buffer.get(tick) || [];
        this.buffer.set(tick, current.concat(commands));
    }

    onInputBundle(callback: (bundle: TickBundle) => void): void {
        this.bundleCallback = callback;
    }

    disconnect(): void { }

    /**
     * HEADLESS ONLY: Instantly processes a tick.
     * It effectively acts as the "Server" broadcasting the bundle immediately
     * so the client can simulate it in the same loop iteration.
     */
    processTick(tick: number) {
        if (!this.bundleCallback) return;

        const commands = this.buffer.get(tick) || [];
        const bundle: TickBundle = { tick, commands };

        this.bundleCallback(bundle);

        // Cleanup
        this.buffer.delete(tick);
    }
}