import { Component, World } from 'bitecs';
import * as C from './components';

/**
 * The Registry maps human-readable strings (from JSON) to bitECS Components.
 * It also handles the logic of "setting" values, because bitECS syntax is specific.
 */
type ComponentSetter = (world: World, eid: number, data: any) => void;

interface RegistryEntry {
    component: Component;
    setter: ComponentSetter;
}

export class ComponentRegistry {
    private map = new Map<string, RegistryEntry>();

    constructor() {
        this.registerCoreComponents();
    }

    private registerCoreComponents() {
        // Position
        this.register('Position', C.Position, (w, e, d) => {
            C.Position.x[e] = d.x;
            C.Position.y[e] = d.y;
        });

        // Velocity
        this.register('Velocity', C.Velocity, (w, e, d) => {
            C.Velocity.x[e] = d.x;
            C.Velocity.y[e] = d.y;
        });

        // Health
        this.register('Health', C.Health, (w, e, d) => {
            C.Health.current[e] = d.current;
            C.Health.max[e] = d.max;
        });

        // UnitState
        this.register('UnitState', C.UnitState, (w, e, d) => {
            // @ts-ignore
            const val = C.UnitStateMap[d.state] ?? 0;
            C.UnitState.state[e] = val;
        });

        // Physics is a "Virtual Component" - it doesn't exist in bitECS, 
        // but the Hydrator sees it and tells Rust to create a body.
    }

    register(name: string, component: Component, setter: ComponentSetter) {
        this.map.set(name, { component, setter });
    }

    get(name: string): RegistryEntry | undefined {
        return this.map.get(name);
    }
}

export const Registry = new ComponentRegistry();