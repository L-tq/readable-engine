import { createWorld, IWorld, getAllEntities, hasComponent } from 'bitecs';
import { SimBridge } from "./SimBridge";
import { Hydrator } from "./Hydrator";
import { LockstepManager } from "../network/LockstepManager";
import { HeadlessAdapter } from "../network/HeadlessAdapter";
import { ErrorReporter } from "./ErrorReporter";
import { createSyncSystem } from "../systems/SyncSystem";
import { Health } from "../ecs/components";

export interface SimulationResult {
    winner: string;
    durationTicks: number;
    survivors: number;
    log: string[];
}

export class HeadlessRunner {
    private world: IWorld;
    private bridge: SimBridge;
    private hydrator: Hydrator;
    private lockstep: LockstepManager;
    private adapter: HeadlessAdapter;
    private syncSystem: (w: IWorld) => IWorld;

    constructor() {
        this.world = createWorld();
        this.bridge = new SimBridge();
        this.hydrator = new Hydrator(this.world, this.bridge);
        this.adapter = new HeadlessAdapter();
        this.lockstep = new LockstepManager(this.adapter, this.bridge);
        this.syncSystem = createSyncSystem(this.bridge);
    }

    async init() {
        await this.bridge.init();
        await this.lockstep.init();
        ErrorReporter.init(this.world);
    }

    /**
     * Accessors for setup scripts
     */
    getDependencies() {
        return {
            world: this.world,
            hydrator: this.hydrator,
            bridge: this.bridge
        };
    }

    /**
     * Runs the simulation for a max duration or until win condition.
     */
    run(maxTicks: number): SimulationResult {
        console.log("🚀 Starting Headless Simulation...");
        const logs: string[] = [];
        let tick = 0;

        try {
            for (tick = 0; tick < maxTicks; tick++) {
                // 1. Update Error Context
                ErrorReporter.setTick(tick);

                // 2. Network/Time Step (Synchronous in Headless)
                // We must trigger the adapter to "broadcast" the inputs for this tick
                this.adapter.processTick(tick);

                // 3. Lockstep Update (Will run Sim.tick inside)
                const advanced = this.lockstep.update();

                if (!advanced) {
                    logs.push(`[Warn] Simulation stalled at tick ${tick}`);
                    break;
                }

                // 4. Sync State back to ECS (to check win conditions)
                this.syncSystem(this.world);

                // 5. Check Win Condition (Simple Example: One team dead)
                // In a real implementation, you'd pass a callback or Query here.
                const entities = getAllEntities(this.world);
                if (entities.length === 0 && tick > 10) {
                    logs.push("All entities died.");
                    break;
                }
            }
        } catch (e: any) {
            logs.push(`CRASH: ${e.message}`);
        }

        // Count survivors with Health > 0
        let survivors = 0;
        const eids = getAllEntities(this.world);
        for (const eid of eids) {
            if (hasComponent(this.world, Health, eid)) {
                if (Health.current[eid] > 0) survivors++;
            }
        }

        return {
            winner: survivors > 0 ? "Survivors" : "None",
            durationTicks: tick,
            survivors,
            log: logs
        };
    }
}