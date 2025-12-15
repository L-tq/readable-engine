import { IWorld, getAllComponents, hasComponent } from 'bitecs';
import { Registry } from '../ecs/Registry';

export interface ErrorContext {
    systemName: string;
    entityId: number | null;
    tick: number;
}

export class ErrorReporter {
    private static context: ErrorContext = {
        systemName: "Unknown",
        entityId: null,
        tick: 0
    };

    private static world: IWorld | null = null;

    static init(world: IWorld) {
        this.world = world;

        // Global Error Listener
        window.addEventListener('error', (event) => {
            this.handleError(event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason);
        });
    }

    static setContext(systemName: string, entityId: number | null) {
        this.context.systemName = systemName;
        this.context.entityId = entityId;
    }

    static setTick(tick: number) {
        this.context.tick = tick;
    }

    /**
     * Wraps a system function with error tracking context.
     * Use this when creating systems.
     */
    static wrapSystem(name: string, systemFn: (world: IWorld) => void): (world: IWorld) => void {
        return (world: IWorld) => {
            try {
                this.setContext(name, null);
                systemFn(world);
            } catch (e) {
                this.handleError(e);
                throw e; // Re-throw to stop loop
            }
        };
    }

    private static handleError(error: any) {
        console.error("🚨 CRITICAL ENGINE FAILURE 🚨");
        console.error("Error:", error);
        console.error("Context:", JSON.stringify(this.context, null, 2));

        if (this.context.entityId !== null && this.world) {
            console.error("💥 Crashing Entity Dump:");
            console.log(this.dumpEntity(this.context.entityId));
        }
    }

    private static dumpEntity(eid: number): any {
        if (!this.world) return "World not initialized";

        const dump: Record<string, any> = { id: eid };
        const components = Registry.getAll();

        for (const entry of components) {
            if (hasComponent(this.world, entry.component, eid)) {
                try {
                    dump[entry.name] = entry.serializer(this.world, eid);
                } catch (e) {
                    dump[entry.name] = "Error retrieving data";
                }
            }
        }
        return dump;
    }
}