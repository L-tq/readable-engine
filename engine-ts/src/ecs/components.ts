import { defineComponent, Types } from 'bitecs';

// Standard "Structure of Arrays" (SoA) layout
export const Position = defineComponent({ x: Types.f64, y: Types.f64 });
export const Velocity = defineComponent({ x: Types.f64, y: Types.f64 });
export const Health = defineComponent({ current: Types.i16, max: Types.i16 });

// Enums must be mapped to integers for bitECS
export const UnitState = defineComponent({ state: Types.ui8 });
export const UnitStateMap = {
    IDLE: 0,
    MOVING: 1,
    ATTACKING: 2
} as const;

// Tag component (no data, just a flag)
export const Selectable = defineComponent();