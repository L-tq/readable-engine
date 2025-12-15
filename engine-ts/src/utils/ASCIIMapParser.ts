import { Hydrator } from "../core/Hydrator";
import { DataManager } from "../data/DataManager";

export class ASCIIMapParser {
    constructor(
        private hydrator: Hydrator,
        private cellSize: number = 2.0
    ) { }

    /**
     * Parses a grid string using a provided legend.
     */
    parse(grid: string[], legend: Record<string, string | null>): number[] {
        const spawnedIds: number[] = [];
        const dataManager = DataManager.getInstance();

        // Calculate offset to center the map
        const height = grid.length;
        const width = grid[0].length;
        const offsetX = (width * this.cellSize) / 2;
        const offsetY = (height * this.cellSize) / 2;

        grid.forEach((line, row) => {
            const chars = line.split('');
            chars.forEach((char, col) => {
                const unitName = legend[char];
                if (!unitName) return; // Empty space

                // 1. Look up the Prefab
                const prefab = dataManager.getUnitDef(unitName);
                if (!prefab) {
                    console.warn(`[ASCIIMapParser] Unknown unit type in legend: '${unitName}'`);
                    return;
                }

                // 2. Calculate World Position
                const x = (col * this.cellSize) - offsetX;
                const y = -((row * this.cellSize) - offsetY);

                // 3. Spawn via Hydrator (overriding position)
                const eid = this.hydrator.spawnEntity(prefab, { x, y });
                if (eid !== -1) {
                    spawnedIds.push(eid);
                }
            });
        });

        console.log(`[ASCIIMapParser] Spawning complete. Created ${spawnedIds.length} entities.`);
        return spawnedIds;
    }
}