// engine-ts/src/network/types.ts

export interface InputCommand {
    id: number;          // Entity ID
    action: string;      // "MOVE", "ATTACK", "STOP"
    target_x: number;
    target_y: number;
    mode?: string;       // "FLOW", "DIRECT"
}

export interface TickBundle {
    tick: number;
    commands: InputCommand[];
}

export interface INetworkAdapter {
    /**
     * Unique Player ID (0 = Host/Local)
     */
    peerId: string;

    /**
     * Connect to the network (Server or P2P swarm)
     * Returns true if connection successful
     */
    connect(): Promise<boolean>;

    /**
     * Send inputs scheduled for a specific future tick.
     */
    sendInput(tick: number, commands: InputCommand[]): void;

    /**
     * Callback when a bundle of inputs is received from the network.
     * In a Client-Server model, this is the authoritative bundle for a tick.
     */
    onInputBundle(callback: (bundle: TickBundle) => void): void;

    /**
     * Disconnect/Cleanup
     */
    disconnect(): void;
}