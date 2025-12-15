// engine-ts/src/network/GeckosAdapter.ts

import { INetworkAdapter, InputCommand, TickBundle } from "./types";
// @ts-ignore - Assuming geckos.io-client is installed in the environment
import geckos, { ClientChannel } from '@geckos.io/client';

export class GeckosAdapter implements INetworkAdapter {
    peerId: string = "Unknown";
    private channel: ClientChannel | null = null;
    private bundleCallback: ((bundle: TickBundle) => void) | null = null;
    private url: string;
    private port: number;

    constructor(url: string = 'http://localhost', port: number = 9208) {
        this.url = url;
        this.port = port;
    }

    async connect(): Promise<boolean> {
        return new Promise((resolve) => {
            this.channel = geckos({
                url: this.url,
                port: this.port
            });

            this.channel.onConnect((error) => {
                if (error) {
                    console.error("[GeckosAdapter] Connection Failed:", error);
                    resolve(false);
                    return;
                }

                console.log("[GeckosAdapter] Connected to Server via WebRTC!");
                this.peerId = this.channel?.id || "Client";

                // Setup Listeners
                this.setupListeners();
                resolve(true);
            });
        });
    }

    private setupListeners() {
        if (!this.channel) return;

        // Listen for Tick Bundles from Server
        this.channel.on('tick', (data: any) => {
            // Data is expected to be TickBundle (JSON)
            if (this.bundleCallback) {
                this.bundleCallback(data as TickBundle);
            }
        });

        // Handle Disconnection
        this.channel.onDisconnect(() => {
            console.warn("[GeckosAdapter] Disconnected from Server.");
        });
    }

    sendInput(tick: number, commands: InputCommand[]): void {
        if (!this.channel) return;

        // Emit 'input' event to server
        // Payload: { tick, commands }
        this.channel.emit('input', { tick, commands });
    }

    onInputBundle(callback: (bundle: TickBundle) => void): void {
        this.bundleCallback = callback;
    }

    disconnect(): void {
        this.channel?.close();
        this.channel = null;
    }
}