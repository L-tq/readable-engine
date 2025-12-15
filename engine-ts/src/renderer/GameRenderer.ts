import * as THREE from 'three';
import { IWorld, defineQuery } from 'bitecs';
import { Position, PrevPosition, Renderable } from '../ecs/components';
import { Assets } from './AssetManager';

export class GameRenderer {
    // PUBLIC: Exposed so CameraManager can control it
    public camera: THREE.PerspectiveCamera;

    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private raycaster = new THREE.Raycaster();
    private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0

    // Instancing: Map<ModelID, InstancedMesh>
    private meshGroups = new Map<number, THREE.InstancedMesh>();
    private renderQuery = defineQuery([Position, Renderable]);
    private dummy = new THREE.Object3D(); // Helper for matrix calculations

    constructor(canvasId: string) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;

        // 1. Setup Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        // Default start position (will be overridden by CameraManager)
        this.camera.position.set(0, 40, 40);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        // 2. Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // 3. Debug Grid
        const grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
        this.scene.add(grid);

        // Handle Resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    render(world: IWorld, alpha: number) {
        const entities = this.renderQuery(world);

        // 1. Group entities by Model ID
        // In a production engine, you'd cache these arrays to avoid GC pressure
        const groups = new Map<number, number[]>();

        for (const eid of entities) {
            const modelId = Renderable.modelId[eid];
            if (!groups.has(modelId)) groups.set(modelId, []);
            groups.get(modelId)!.push(eid);
        }

        // 2. Update Instanced Meshes
        for (const [modelId, eids] of groups.entries()) {
            let mesh = this.getOrCreateInstancedMesh(modelId, eids.length);

            // Resize buffer if needed (simple approach: create new if too small)
            if (mesh.count < eids.length) {
                this.scene.remove(mesh);
                mesh.dispose();
                this.meshGroups.delete(modelId);
                mesh = this.getOrCreateInstancedMesh(modelId, eids.length * 2);
            }

            mesh.count = eids.length;

            for (let i = 0; i < eids.length; i++) {
                const eid = eids[i];

                // --- INTERPOLATION ---
                // VisualPos = Prev + (Curr - Prev) * alpha
                const currX = Position.x[eid];
                const currY = Position.y[eid];

                // If PrevPosition doesn't exist yet (first frame), use Current
                const prevX = PrevPosition.x[eid] ?? currX;
                const prevY = PrevPosition.y[eid] ?? currY;

                const x = prevX + (currX - prevX) * alpha;
                const z = prevY + (currY - prevY) * alpha; // Map Sim Y to 3D Z

                this.dummy.position.set(x, 0.5, z); // 0.5 is half height of 1.0 box
                this.dummy.updateMatrix();
                mesh.setMatrixAt(i, this.dummy.matrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
        }

        this.renderer.render(this.scene, this.camera);
    }

    private getOrCreateInstancedMesh(modelId: number, capacity: number): THREE.InstancedMesh {
        if (this.meshGroups.has(modelId)) {
            const existing = this.meshGroups.get(modelId)!;
            // Check if the geometry matches (in case assets reloaded), logic omitted for brevity
            // Check capacity
            if (existing.instanceMatrix.count >= capacity) return existing;
        }

        const geo = Assets.getGeometry(modelId);
        const mat = Assets.getMaterial(modelId);
        const mesh = new THREE.InstancedMesh(geo, mat, capacity);

        // Optimization: Mark as dynamic since we update it every frame
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.scene.add(mesh);
        this.meshGroups.set(modelId, mesh);
        return mesh;
    }

    // --- UTILS FOR INPUT ---

    /**
     * Raycast from screen space to the ground plane (y=0).
     */
    getGroundIntersection(mouse: { x: number, y: number }): { x: number, y: number } | null {
        this.raycaster.setFromCamera(mouse, this.camera);
        const target = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);

        if (hit) return { x: target.x, y: target.z }; // Map 3D Z back to Sim Y
        return null;
    }
}