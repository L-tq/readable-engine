import { LockstepManager } from "../network/LockstepManager";
import { InputCommand } from "../network/types";
import { IWorld } from "bitecs";
import { GameRenderer } from "../renderer/GameRenderer";
import { SpatialGrid } from "./SpatialGrid";

export class InputManager {
    private selectedEntityId: number | null = null;
    private spatialGrid = new SpatialGrid(5.0);

    constructor(
        private canvasId: string,
        private world: IWorld,
        private lockstep: LockstepManager,
        private renderer: GameRenderer
    ) {
        this.setupListeners();
    }

    update() {
        // Rebuild grid every frame for accurate selection
        this.spatialGrid.update(this.world);
    }

    private setupListeners() {
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) return;

        // Right Click to Move
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleMoveCommand(e);
        });

        // Left Click to Select
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.handleSelection(e);
        });
    }

    private getNormalizedMouse(e: MouseEvent) {
        return {
            x: (e.clientX / window.innerWidth) * 2 - 1,
            y: -(e.clientY / window.innerHeight) * 2 + 1
        };
    }

    private handleSelection(e: MouseEvent) {
        const mouse = this.getNormalizedMouse(e);
        const worldPos = this.renderer.getGroundIntersection(mouse);

        if (!worldPos) return;

        // Query the Spatial Grid
        // Radius 2.0 allows selecting units easily even if clicking slightly off
        const hits = this.spatialGrid.queryRadius(worldPos.x, worldPos.y, 2.0);

        if (hits.length > 0) {
            // Select the first one found (Logic could be improved to find closest)
            this.selectedEntityId = hits[0];
            console.log(`[Input] Selected Unit ${this.selectedEntityId}`);
        } else {
            this.selectedEntityId = null;
            console.log("[Input] Deselected");
        }
    }

    private handleMoveCommand(e: MouseEvent) {
        if (this.selectedEntityId === null) return;

        const mouse = this.getNormalizedMouse(e);
        const worldPos = this.renderer.getGroundIntersection(mouse);

        if (!worldPos) return;

        const cmd: InputCommand = {
            id: this.selectedEntityId,
            action: "MOVE",
            target_x: worldPos.x,
            target_y: worldPos.y,
            mode: "FLOW"
        };

        this.lockstep.queueCommand(cmd);
    }

    // Getter for debug UI
    public getSelectedId() { return this.selectedEntityId; }
}