import { EntityDef, EntityDefSchema } from './schema';

export interface ScenarioDef {
    id: string;
    description: string;
    maxTicks: number;
    winCondition: {
        type: "SURVIVE" | "ELIMINATE_TYPE" | "ELIMINATE_ALL";
        targetType?: string; // For ELIMINATE_TYPE
        duration?: number;   // For SURVIVE
    };
    map: {
        legend: Record<string, string | null>;
        grid: string[];
    };
}

export class DataManager {
    private static instance: DataManager;
    private units: Map<string, EntityDef> = new Map();
    private scenarios: Map<string, ScenarioDef> = new Map();

    private constructor() { }

    public static getInstance(): DataManager {
        if (!DataManager.instance) {
            DataManager.instance = new DataManager();
        }
        return DataManager.instance;
    }

    /**
     * Loads unit definitions from the external JSON file.
     */
    async loadUnits(url: string = '/game-data/units.json') {
        const response = await fetch(url);
        const json = await response.json();

        for (const [key, value] of Object.entries(json)) {
            // Validate against Zod Schema
            const result = EntityDefSchema.safeParse(value);
            if (result.success) {
                this.units.set(key, result.data);
            } else {
                console.error(`[DataManager] Invalid Unit Def '${key}':`, result.error);
            }
        }
        console.log(`[DataManager] Loaded ${this.units.size} unit prefabs.`);
    }

    /**
     * Loads a specific scenario.
     */
    async loadScenario(url: string): Promise<ScenarioDef | null> {
        try {
            const response = await fetch(url);
            const json = await response.json();
            // In production, add a Zod schema for Scenarios too
            return json as ScenarioDef;
        } catch (e) {
            console.error(`[DataManager] Failed to load scenario: ${url}`, e);
            return null;
        }
    }

    getUnitDef(name: string): EntityDef | undefined {
        return this.units.get(name);
    }
}