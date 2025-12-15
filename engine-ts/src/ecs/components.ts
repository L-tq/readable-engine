import { defineComponent, Types } from 'bitecs';

// Standard "Structure of Arrays" (SoA) layout
export const Position = defineComponent({ x: Types.f64, y: Types.f64 });
export const Velocity = defineComponent({ x: Types.f64, y: Types.f64 });

// NEW: Required for Render Interpolation (Sim runs at 15Hz, Render at 60Hz)
export const PrevPosition = defineComponent({ x: Types.f64, y: Types.f64 });

// NEW: Tells the renderer which model to draw
// We use an integer ID to map to a string in the AssetManager
export const Renderable = defineComponent({ modelId: Types.ui16 });

export const Health = defineComponent({ current: Types.i16, max: Types.i16 });

// Enums must be mapped to integers for bitECS
export const UnitState = defineComponent({ state: Types.ui8 });
export const UnitStateMap = {
    IDLE: 0,
    MOVING: 1,
    ATTACKING: 2
} as const;

export const Selectable = defineComponent();