import { Component, World, hasComponent, removeComponent, addComponent } from 'bitecs';
import * as C from './components';
import { Assets } from '../renderer/AssetManager';

type ComponentSetter = (world: World, eid: number, data: any) => void;
type ComponentGetter = (world: World, eid: number) => any;

interface RegistryEntry {
    name: string;
    component: Component;
    setter: ComponentSetter;
    serializer: ComponentGetter;
}

export class ComponentRegistry {
    public map = new Map<string, RegistryEntry>();

    constructor() {
        this.registerCoreComponents();
    }

    private registerCoreComponents() {
        // ... (Previous components: Position, Velocity, Health, etc) ...

        this.register('Position', C.Position,
            (w, e, d) => { C.Position.x[e] = d.x; C.Position.y[e] = d.y; },
            (w, e) => ({ x: C.Position.x[e], y: C.Position.y[e] })
        );

        this.register('Velocity', C.Velocity,
            (w, e, d) => { C.Velocity.x[e] = d.x; C.Velocity.y[e] = d.y; },
            (w, e) => ({ x: C.Velocity.x[e], y: C.Velocity.y[e] })
        );

        this.register('Health', C.Health,
            (w, e, d) => { C.Health.current[e] = d.current; C.Health.max[e] = d.max; },
            (w, e) => ({ current: C.Health.current[e], max: C.Health.max[e] })
        );

        this.register('UnitState', C.UnitState,
            (w, e, d) => {
                // @ts-ignore
                const val = C.UnitStateMap[d.state] ?? 0;
                C.UnitState.state[e] = val;
            },
            (w, e) => {
                const val = C.UnitState.state[e];
                const key = Object.keys(C.UnitStateMap).find(k => (C.UnitStateMap as any)[k] === val);
                return { state: key || "IDLE" };
            }
        );

        this.register('Renderable', C.Renderable,
            (w, e, d) => {
                const id = Assets.getModelId(d.modelName);
                C.Renderable.modelId[e] = id;
            },
            (w, e) => ({ modelName: "Unknown" })
        );

        // --- NEW: Register Selectable ---
        // It's a Tag Component (no data), so setter/serializer are empty
        this.register('Selectable', C.Selectable,
            (w, e, d) => { /* No data to set */ },
            (w, e) => ({})
        );
    }

    register(name: string, component: Component, setter: ComponentSetter, serializer: ComponentGetter) {
        this.map.set(name, { name, component, setter, serializer });
    }

    get(name: string): RegistryEntry | undefined {
        return this.map.get(name);
    }

    getAll() {
        return Array.from(this.map.values());
    }
}

export const Registry = new ComponentRegistry();