import { LockstepManager } from "../network/LockstepManager";
import { InputCommand } from "../network/types";
import { IWorld, defineQuery } from "bitecs";
import { GameRenderer } from "../renderer/GameRenderer";
import { Position, Selectable } from "../ecs/components";
import * as THREE from 'three';

export class InputManager {
    // State
    private selectedEntityIds = new Set<number>();

    // Drag State
    private isDragging = false;
    private dragStart = { x: 0, y: 0 };
    private currentMouse = { x: 0, y: 0 };

    // DOM Elements
    private selectionBoxEl: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;

    // Queries
    private selectableQuery = defineQuery([Position, Selectable]);

    constructor(
        private canvasId: string,
        private world: IWorld,
        private lockstep: LockstepManager,
        private renderer: GameRenderer
    ) {
        this.selectionBoxEl = document.getElementById('selection-box');
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.setupListeners();
    }

    update() {
        // No per-frame logic needed for input state currently, 
        // as we handle everything via events.
    }

    private setupListeners() {
        if (!this.canvas) return;

        // 1. Right Click (Move Command)
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleMoveCommand(e);
        });

        // 2. Mouse Down (Start Selection)
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left Click
                this.isDragging = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.currentMouse = { x: e.clientX, y: e.clientY };
                this.updateSelectionBoxVisual();
            }
        });

        // 3. Mouse Move (Update Box)
        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.currentMouse = { x: e.clientX, y: e.clientY };
                this.updateSelectionBoxVisual();
            }
        });

        // 4. Mouse Up (End Selection)
        window.addEventListener('mouseup', (e) => {
            if (this.isDragging && e.button === 0) {
                this.finishSelection();
                this.isDragging = false;
                this.updateSelectionBoxVisual();
            }
        });
    }

    private updateSelectionBoxVisual() {
        if (!this.selectionBoxEl) return;

        if (!this.isDragging) {
            this.selectionBoxEl.style.display = 'none';
            return;
        }

        // Calculate dimensions
        const minX = Math.min(this.dragStart.x, this.currentMouse.x);
        const minY = Math.min(this.dragStart.y, this.currentMouse.y);
        const width = Math.abs(this.currentMouse.x - this.dragStart.x);
        const height = Math.abs(this.currentMouse.y - this.dragStart.y);

        // Only show if box is big enough (prevents flickering on simple clicks)
        if (width > 5 || height > 5) {
            this.selectionBoxEl.style.display = 'block';
            this.selectionBoxEl.style.left = `${minX}px`;
            this.selectionBoxEl.style.top = `${minY}px`;
            this.selectionBoxEl.style.width = `${width}px`;
            this.selectionBoxEl.style.height = `${height}px`;
        } else {
            this.selectionBoxEl.style.display = 'none';
        }
    }

    private finishSelection() {
        // 1. Determine Selection Bounds
        const minX = Math.min(this.dragStart.x, this.currentMouse.x);
        const maxX = Math.max(this.dragStart.x, this.currentMouse.x);
        const minY = Math.min(this.dragStart.y, this.currentMouse.y);
        const maxY = Math.max(this.dragStart.y, this.currentMouse.y);

        const isClick = (maxX - minX < 5) && (maxY - minY < 5);

        // Clear previous selection unless Shift is held (TODO: Add Shift support)
        this.selectedEntityIds.clear();

        if (isClick) {
            // --- SINGLE CLICK SELECTION ---
            // Raycast to ground
            const mouseNorm = {
                x: (this.dragStart.x / window.innerWidth) * 2 - 1,
                y: -(this.dragStart.y / window.innerHeight) * 2 + 1
            };
            const worldPos = this.renderer.getGroundIntersection(mouseNorm);

            if (worldPos) {
                // Find closest unit within radius
                const entities = this.selectableQuery(this.world);
                let closestId = -1;
                let closestDist = 2.0; // Selection radius

                for (const eid of entities) {
                    const dx = Position.x[eid] - worldPos.x;
                    const dy = Position.y[eid] - worldPos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestId = eid;
                    }
                }

                if (closestId !== -1) {
                    this.selectedEntityIds.add(closestId);
                }
            }
        } else {
            // --- BOX SELECTION (Screen Space) ---
            const entities = this.selectableQuery(this.world);
            const camera = this.renderer.camera;
            const tempVec = new THREE.Vector3();

            for (const eid of entities) {
                // Get World Position (Sim Y -> 3D Z)
                tempVec.set(Position.x[eid], 0, Position.y[eid]);

                // Project to Screen Space (-1 to +1)
                tempVec.project(camera);

                // Convert to Pixel Coordinates
                const px = (tempVec.x * .5 + .5) * window.innerWidth;
                const py = (-(tempVec.y * .5) + .5) * window.innerHeight;

                // Check Bounds
                if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                    this.selectedEntityIds.add(eid);
                }
            }
        }

        console.log(`[Input] Selected ${this.selectedEntityIds.size} units.`);

        // Sync selection to Renderer for visual feedback
        this.renderer.updateSelection(this.selectedEntityIds);
    }

    private handleMoveCommand(e: MouseEvent) {
        if (this.selectedEntityIds.size === 0) return;

        const mouse = {
            x: (e.clientX / window.innerWidth) * 2 - 1,
            y: -(e.clientY / window.innerHeight) * 2 + 1
        };
        const worldPos = this.renderer.getGroundIntersection(mouse);

        if (!worldPos) return;

        // Send command for ALL selected units
        for (const eid of this.selectedEntityIds) {
            const cmd: InputCommand = {
                id: eid,
                action: "MOVE",
                target_x: worldPos.x,
                target_y: worldPos.y,
                mode: "FLOW"
            };
            this.lockstep.queueCommand(cmd);
        }

        // Visual feedback (optional)
        console.log(`[Input] Ordered ${this.selectedEntityIds.size} units to (${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)})`);
    }

    public getSelectedIds() { return this.selectedEntityIds; }
}