import { Hydrator } from "../core/Hydrator";
import { DataManager } from "../data/DataManager";

export interface MapBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface ParseResult {
    spawnedIds: number[];
    bounds: MapBounds;
}

export class ASCIIMapParser {
    constructor(
        private hydrator: Hydrator,
        private cellSize: number = 2.0
    ) { }

    /**
     * Parses a grid string using a provided legend.
     * Returns the list of spawned entity IDs and the calculated world bounds.
     */
    parse(grid: string[], legend: Record<string, string | null>): ParseResult {
        const spawnedIds: number[] = [];
        const dataManager = DataManager.getInstance();

        // Calculate map dimensions
        const height = grid.length;
        const width = grid[0].length;

        // Calculate offsets to center the map at (0,0)
        const offsetX = (width * this.cellSize) / 2;
        const offsetY = (height * this.cellSize) / 2;

        // Determine World Bounds (Sim Y maps to 3D Z)
        // Min/Max X is straightforward
        const minX = -offsetX;
        const maxX = offsetX;

        // Min/Max Z corresponds to Sim Y range
        // Row 0 -> Y = offsetY (Max Z / Bottom of Screen)
        // Row Max -> Y = -offsetY (Min Z / Top of Screen)
        const minZ = -offsetY;
        const maxZ = offsetY;

        grid.forEach((line, row) => {
            const chars = line.split('');
            chars.forEach((char, col) => {
                const unitName = legend[char];
                if (!unitName) return;

                // 1. Look up the Prefab
                const prefab = dataManager.getUnitDef(unitName);
                if (!prefab) {
                    console.warn(`[ASCIIMapParser] Unknown unit type in legend: '${unitName}'`);
                    return;
                }

                // 2. Calculate World Position
                const x = (col * this.cellSize) - offsetX;
                const y = -((row * this.cellSize) - offsetY);

                // 3. Spawn
                const eid = this.hydrator.spawnEntity(prefab, { x, y });
                if (eid !== -1) {
                    spawnedIds.push(eid);
                }
            });
        });

        console.log(`[ASCIIMapParser] Map Loaded. Bounds: [X: ${minX} to ${maxX}, Z: ${minZ} to ${maxZ}]`);

        return {
            spawnedIds,
            bounds: { minX, maxX, minZ, maxZ }
        };
    }
}