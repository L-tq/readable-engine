import { z } from 'zod';

// 1. Primitive Schemas
export const Vector2Schema = z.object({
    x: z.number(),
    y: z.number()
});

// 2. Component Schemas
export const ComponentsSchema = z.object({
    Position: Vector2Schema.optional(),
    Velocity: Vector2Schema.optional(),
    Health: z.object({
        current: z.number(),
        max: z.number()
    }).optional(),
    UnitState: z.object({
        state: z.enum(["IDLE", "MOVING", "ATTACKING"])
    }).optional(),
    Physics: z.object({
        radius: z.number(),
        max_speed: z.number()
    }).optional(),
    Renderable: z.object({
        modelName: z.string()
    }).optional(),

    // NEW: Allow "Selectable" (Empty object)
    Selectable: z.object({}).optional()
});

// 3. Entity Definition
export const EntityDefSchema = z.object({
    name: z.string(),
    components: ComponentsSchema
});

export type EntityDef = z.infer<typeof EntityDefSchema>;