import * as THREE from 'three';
import { MapBounds } from '../utils/ASCIIMapParser';

export class CameraManager {
    private camera: THREE.PerspectiveCamera;

    // --- CONFIGURATION ---
    private readonly PAN_SPEED = 1.0;
    private readonly EDGE_THRESHOLD = 20;
    private readonly ZOOM_SPEED = 5.0;
    private readonly MIN_ZOOM = 10;
    private readonly MAX_ZOOM = 80;

    // Lower smoothing value = "Heavier" / Smoother feel (0.05 - 0.1 is good)
    private readonly SMOOTHING = 0.1;

    private bounds: MapBounds = {
        minX: -100, maxX: 100,
        minZ: -100, maxZ: 100
    };

    // --- STATE ---
    // Where we WANT to look (The Input)
    private targetLookAt: THREE.Vector3;
    // Where we are CURRENTLY looking (The Smoothed Value)
    private currentLookAt: THREE.Vector3;

    private currentZoom: number;
    private targetZoom: number;

    // Inputs
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

        // Initialize state
        this.currentZoom = 40;
        this.targetZoom = 40;

        // Start at 0,0,0
        this.targetLookAt = new THREE.Vector3(0, 0, 0);
        this.currentLookAt = new THREE.Vector3(0, 0, 0);

        this.setupListeners(canvas);

        // Force initial update to prevent "swoop" on load
        this.updateCameraTransform(true);
    }

    public setBounds(bounds: MapBounds) {
        const padding = 5;
        this.bounds = {
            minX: bounds.minX - padding,
            maxX: bounds.maxX + padding,
            minZ: bounds.minZ - padding,
            maxZ: bounds.maxZ + padding
        };

        // Clamp immediately to prevent being stuck out of bounds on load
        this.targetLookAt.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.targetLookAt.x));
        this.targetLookAt.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.targetLookAt.z));
    }

    private setupListeners(canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', (e) => this.handleKey(e.key, true));
        window.addEventListener('keyup', (e) => this.handleKey(e.key, false));

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDir = Math.sign(e.deltaY);
            this.targetZoom += zoomDir * this.ZOOM_SPEED;
            this.targetZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.targetZoom));
        }, { passive: false });

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

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

        // 1. Process Input
        if (this.keys.ArrowUp) moveZ -= this.PAN_SPEED;
        if (this.keys.ArrowDown) moveZ += this.PAN_SPEED;
        if (this.keys.ArrowLeft) moveX -= this.PAN_SPEED;
        if (this.keys.ArrowRight) moveX += this.PAN_SPEED;

        // Edge Scrolling
        if (this.mouseX < this.EDGE_THRESHOLD) moveX -= this.PAN_SPEED;
        if (this.mouseX > window.innerWidth - this.EDGE_THRESHOLD) moveX += this.PAN_SPEED;
        if (this.mouseY < this.EDGE_THRESHOLD) moveZ -= this.PAN_SPEED;
        if (this.mouseY > window.innerHeight - this.EDGE_THRESHOLD) moveZ += this.PAN_SPEED;

        // 2. Update Target (The "Ghost" position)
        if (moveX !== 0 || moveZ !== 0) {
            const zoomFactor = this.currentZoom / 40.0;
            this.targetLookAt.x += moveX * zoomFactor;
            this.targetLookAt.z += moveZ * zoomFactor;

            // Clamp Target
            this.targetLookAt.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.targetLookAt.x));
            this.targetLookAt.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.targetLookAt.z));
        }

        // 3. Apply Smoothing
        this.updateCameraTransform(false);
    }

    private updateCameraTransform(forceSnap: boolean) {
        if (forceSnap) {
            this.currentLookAt.copy(this.targetLookAt);
            this.currentZoom = this.targetZoom;
        } else {
            // Smoothly interpolate the LookAt point
            this.currentLookAt.lerp(this.targetLookAt, this.SMOOTHING);
            // Smoothly interpolate Zoom
            this.currentZoom += (this.targetZoom - this.currentZoom) * this.SMOOTHING;
        }

        // 4. Calculate Camera Position RELATIVE to the smoothed LookAt
        // Standard RTS Angle: 45 degrees (Offset Y = Offset Z)
        const offsetHeight = this.currentZoom;
        const offsetBack = this.currentZoom;

        this.camera.position.set(
            this.currentLookAt.x,
            offsetHeight, // Height
            this.currentLookAt.z + offsetBack // Back
        );

        // 5. Look at the SMOOTHED point
        this.camera.lookAt(this.currentLookAt);
    }
}