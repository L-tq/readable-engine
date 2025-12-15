import { LockstepManager } from "../network/LockstepManager";
import { InputCommand } from "../network/types";
import { Position, Selectable } from "../ecs/components";
import { defineQuery, IWorld } from "bitecs";

export class InputManager {
    private canvas: HTMLCanvasElement;
    private selectedEntityId: number | null = null;
    private selectionQuery = defineQuery([Selectable, Position]);

    constructor(
        canvasId: string,
        private world: IWorld,
        private lockstep: LockstepManager
    ) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.setupListeners();
    }

    private setupListeners() {
        // Right Click to Move
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleMoveCommand(e);
        });

        // Left Click to Select (Simple Mock)
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.handleSelection(e);
        });
    }

    private getMousePos(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        // Visual Scale is 4 (from main.ts drawWorld). 
        // We need to divide by 4 to get Sim Coordinates.
        const VISUAL_SCALE = 4;

        return {
            x: ((e.clientX - rect.left) * scaleX) / VISUAL_SCALE,
            y: ((e.clientY - rect.top) * scaleY) / VISUAL_SCALE
        };
    }

    private handleSelection(e: MouseEvent) {
        const { x, y } = this.getMousePos(e);
        const entities = this.selectionQuery(this.world);

        let found = false;

        // Simple circle check for selection
        for (const eid of entities) {
            const px = Position.x[eid];
            const py = Position.y[eid];
            const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

            if (dist < 2.0) { // 2.0 unit selection radius
                this.selectedEntityId = eid;
                console.log(`[Input] Selected Unit ${eid}`);
                found = true;
                break;
            }
        }

        if (!found) {
            this.selectedEntityId = null;
            console.log("[Input] Deselected");
        }
    }

    private handleMoveCommand(e: MouseEvent) {
        if (this.selectedEntityId === null) return;

        const { x, y } = this.getMousePos(e);

        const cmd: InputCommand = {
            id: this.selectedEntityId,
            action: "MOVE",
            target_x: x,
            target_y: y,
            mode: "FLOW" // Default to flow field
        };

        console.log(`[Input] Queued Move for ${this.selectedEntityId} to (${x.toFixed(1)}, ${y.toFixed(1)})`);
        this.lockstep.queueCommand(cmd);
    }
}