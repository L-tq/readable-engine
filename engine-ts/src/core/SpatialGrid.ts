import { IWorld, defineQuery } from 'bitecs';
import { Position } from '../ecs/components';

export class SpatialGrid {
    private cellSize: number;
    private grid = new Map<string, number[]>();
    private query = defineQuery([Position]);

    constructor(cellSize: number = 5.0) {
        this.cellSize = cellSize;
    }

    /**
     * Rebuilds the spatial hash. 
     * Call this once per frame or before processing inputs.
     * For <5000 units, full rebuild is faster than tracking deltas in JS.
     */
    update(world: IWorld) {
        this.grid.clear();
        const entities = this.query(world);

        for (const eid of entities) {
            const x = Position.x[eid];
            const y = Position.y[eid];
            const key = this.getKey(x, y);

            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key)!.push(eid);
        }
    }

    /**
     * Returns all Entity IDs within the given world radius.
     */
    queryRadius(x: number, y: number, radius: number): number[] {
        const results: number[] = [];

        // Determine grid range
        const startX = Math.floor((x - radius) / this.cellSize);
        const endX = Math.floor((x + radius) / this.cellSize);
        const startY = Math.floor((y - radius) / this.cellSize);
        const endY = Math.floor((y + radius) / this.cellSize);

        for (let cx = startX; cx <= endX; cx++) {
            for (let cy = startY; cy <= endY; cy++) {
                const key = `${cx},${cy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const eid of cell) {
                        // Precise check
                        const dx = Position.x[eid] - x;
                        const dy = Position.y[eid] - y;
                        if (dx * dx + dy * dy <= radius * radius) {
                            results.push(eid);
                        }
                    }
                }
            }
        }
        return results;
    }

    private getKey(x: number, y: number): string {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }
}