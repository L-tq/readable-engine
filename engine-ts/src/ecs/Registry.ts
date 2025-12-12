import { Component, World, hasComponent, removeComponent, addComponent } from 'bitecs';
import * as C from './components';

type ComponentSetter = (world: World, eid: number, data: any) => void;
type ComponentGetter = (world: World, eid: number) => any;

interface RegistryEntry {
    name: string;
    component: Component;
    setter: ComponentSetter;     // JSON -> ECS
    serializer: ComponentGetter; // ECS -> JSON
}

export class ComponentRegistry {
    // Map human-readable string to component logic
    public map = new Map<string, RegistryEntry>();

    constructor() {
        this.registerCoreComponents();
    }

    private registerCoreComponents() {
        // --- POSITION ---
        this.register('Position', C.Position,
            (w, e, d) => {
                C.Position.x[e] = d.x;
                C.Position.y[e] = d.y;
            },
            (w, e) => ({ x: C.Position.x[e], y: C.Position.y[e] })
        );

        // --- VELOCITY ---
        this.register('Velocity', C.Velocity,
            (w, e, d) => {
                C.Velocity.x[e] = d.x;
                C.Velocity.y[e] = d.y;
            },
            (w, e) => ({ x: C.Velocity.x[e], y: C.Velocity.y[e] })
        );

        // --- HEALTH ---
        this.register('Health', C.Health,
            (w, e, d) => {
                C.Health.current[e] = d.current;
                C.Health.max[e] = d.max;
            },
            (w, e) => ({ current: C.Health.current[e], max: C.Health.max[e] })
        );

        // --- UNIT STATE ---
        this.register('UnitState', C.UnitState,
            (w, e, d) => {
                // @ts-ignore - Runtime check for enum mapping
                const val = C.UnitStateMap[d.state] ?? 0;
                C.UnitState.state[e] = val;
            },
            (w, e) => {
                const val = C.UnitState.state[e];
                // Reverse map int -> string for JSON readability
                const key = Object.keys(C.UnitStateMap).find(k => (C.UnitStateMap as any)[k] === val);
                return { state: key || "IDLE" };
            }
        );

        // "Physics" is excluded here because it is a Virtual Component handled by Rust,
        // not a bitECS component. It is handled explicitly in the Hydrator/StateManager.
    }

    /**
     * Registers a component for use with the Hydrator and Snapshot system.
     */
    register(name: string, component: Component, setter: ComponentSetter, serializer: ComponentGetter) {
        this.map.set(name, { name, component, setter, serializer });
    }

    get(name: string): RegistryEntry | undefined {
        return this.map.get(name);
    }

    /**
     * Returns all registered components.
     */
    getAll() {
        return Array.from(this.map.values());
    }
}

export const Registry = new ComponentRegistry();