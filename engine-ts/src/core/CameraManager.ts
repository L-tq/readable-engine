import * as THREE from 'three';
import { MapBounds } from '../utils/ASCIIMapParser';

export class CameraManager {
    private camera: THREE.PerspectiveCamera;

    // --- CONFIGURATION ---
    private readonly PAN_SPEED = 1.0;
    private readonly EDGE_THRESHOLD = 20; // Pixels from edge
    private readonly ZOOM_SPEED = 5.0;
    private readonly MIN_ZOOM = 10;
    private readonly MAX_ZOOM = 80;
    private readonly SMOOTHING = 0.1;

    // Default Limits (Overwritten by setBounds)
    private bounds: MapBounds = {
        minX: -100, maxX: 100,
        minZ: -100, maxZ: 100
    };

    // State
    private targetPosition: THREE.Vector3;
    private currentZoom: number;
    private targetZoom: number;

    // Inputs (Arrows Only)
    private keys = {
        ArrowUp: false,
        ArrowLeft: false,
        ArrowDown: false,
        ArrowRight: false
    };

    private mouseX = window.innerWidth / 2;
    private mouseY = window.innerHeight / 2;

    constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
        this.camera = camera;

        // Sync initial state
        this.targetPosition = this.camera.position.clone();
        this.currentZoom = this.camera.position.y;
        this.targetZoom = this.currentZoom;

        this.setupListeners(canvas);
    }

    public setBounds(bounds: MapBounds) {
        // Add a small padding (e.g., 10 units) so we can see units standing on the edge
        const padding = 10;
        this.bounds = {
            minX: bounds.minX - padding,
            maxX: bounds.maxX + padding,
            minZ: bounds.minZ - padding,
            maxZ: bounds.maxZ + padding
        };
        console.log("[Camera] Bounds updated:", this.bounds);
    }

    private setupListeners(canvas: HTMLCanvasElement) {
        // 1. Keyboard (Arrows)
        window.addEventListener('keydown', (e) => this.handleKey(e.key, true));
        window.addEventListener('keyup', (e) => this.handleKey(e.key, false));

        // 2. Mouse Wheel
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDir = Math.sign(e.deltaY);
            this.targetZoom += zoomDir * this.ZOOM_SPEED;
            this.targetZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.targetZoom));
        }, { passive: false });

        // 3. Mouse Edge
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        // Safety: Stop edge scrolling if mouse leaves window
        window.addEventListener('mouseleave', () => {
            this.mouseX = window.innerWidth / 2;
            this.mouseY = window.innerHeight / 2;
        });
    }

    private handleKey(key: string, isPressed: boolean) {
        if (key === 'ArrowUp') this.keys.ArrowUp = isPressed;
        if (key === 'ArrowDown') this.keys.ArrowDown = isPressed;
        if (key === 'ArrowLeft') this.keys.ArrowLeft = isPressed;
        if (key === 'ArrowRight') this.keys.ArrowRight = isPressed;
    }

    public update() {
        let moveX = 0;
        let moveZ = 0;

        // --- 1. Keyboard Input ---
        if (this.keys.ArrowUp) moveZ -= this.PAN_SPEED;
        if (this.keys.ArrowDown) moveZ += this.PAN_SPEED;
        if (this.keys.ArrowLeft) moveX -= this.PAN_SPEED;
        if (this.keys.ArrowRight) moveX += this.PAN_SPEED;

        // --- 2. Edge Scrolling ---
        // Only scroll if we are not IDLE (mouse moved at least once)
        if (this.mouseX < this.EDGE_THRESHOLD) moveX -= this.PAN_SPEED;
        if (this.mouseX > window.innerWidth - this.EDGE_THRESHOLD) moveX += this.PAN_SPEED;

        if (this.mouseY < this.EDGE_THRESHOLD) moveZ -= this.PAN_SPEED;
        if (this.mouseY > window.innerHeight - this.EDGE_THRESHOLD) moveZ += this.PAN_SPEED;

        // --- 3. Apply & Clamp ---
        if (moveX !== 0 || moveZ !== 0) {
            // Pan faster when zoomed out
            const zoomFactor = this.currentZoom / 40.0;

            this.targetPosition.x += moveX * zoomFactor;
            this.targetPosition.z += moveZ * zoomFactor;

            // CLAMPING
            this.targetPosition.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.targetPosition.x));
            this.targetPosition.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.targetPosition.z));
        }

        // --- 4. Smooth Interpolation ---
        this.camera.position.x += (this.targetPosition.x - this.camera.position.x) * this.SMOOTHING;
        this.camera.position.z += (this.targetPosition.z - this.camera.position.z) * this.SMOOTHING;

        this.currentZoom += (this.targetZoom - this.currentZoom) * this.SMOOTHING;
        this.camera.position.y = this.currentZoom;

        // Maintain Angle
        this.camera.lookAt(
            this.camera.position.x,
            0,
            this.camera.position.z - (this.currentZoom * 0.5)
        );
    }
}