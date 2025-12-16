import * as THREE from 'three';
import { IWorld, defineQuery, hasComponent } from 'bitecs';
import { Position, PrevPosition, Renderable } from '../ecs/components';
import { Assets } from './AssetManager';

export class GameRenderer {
    public camera: THREE.PerspectiveCamera;

    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private raycaster = new THREE.Raycaster();
    private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Unit Rendering
    private meshGroups = new Map<number, THREE.InstancedMesh>();
    private renderQuery = defineQuery([Position, Renderable]);
    private dummy = new THREE.Object3D();

    // Selection Highlights
    private selectionMesh: THREE.InstancedMesh;
    private currentSelection = new Set<number>();

    constructor(canvasId: string) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;

        // Setup Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 40, 40);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // Debug Grid
        const grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
        this.scene.add(grid);

        // Initialize Selection Ring Mesh
        // A simple green ring geometry
        const ringGeo = new THREE.RingGeometry(0.6, 0.7, 32);
        ringGeo.rotateX(-Math.PI / 2); // Lay flat
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            depthTest: false // Always show on top of terrain
        });

        // Max 1000 selected units supported
        this.selectionMesh = new THREE.InstancedMesh(ringGeo, ringMat, 1000);
        this.selectionMesh.count = 0; // Start invisible
        this.selectionMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.selectionMesh);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    updateSelection(selectedIds: Set<number>) {
        this.currentSelection = selectedIds;
    }

    render(world: IWorld, alpha: number) {
        // 1. Render Units (Existing Logic)
        const entities = this.renderQuery(world);
        const groups = new Map<number, number[]>();

        for (const eid of entities) {
            const modelId = Renderable.modelId[eid];
            if (!groups.has(modelId)) groups.set(modelId, []);
            groups.get(modelId)!.push(eid);
        }

        for (const [modelId, eids] of groups.entries()) {
            let mesh = this.getOrCreateInstancedMesh(modelId, eids.length);
            if (mesh.count < eids.length) {
                this.scene.remove(mesh);
                mesh.dispose();
                this.meshGroups.delete(modelId);
                mesh = this.getOrCreateInstancedMesh(modelId, eids.length * 2);
            }
            mesh.count = eids.length;

            for (let i = 0; i < eids.length; i++) {
                const eid = eids[i];
                this.positionDummy(eid, alpha, world);
                mesh.setMatrixAt(i, this.dummy.matrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
        }

        // 2. Render Selection Rings
        // Filter selection to ensure entities still exist
        let ringIndex = 0;
        const validSelection: number[] = [];

        for (const eid of this.currentSelection) {
            // Check if entity is still valid (might have died)
            if (hasComponent(world, Position, eid)) {
                validSelection.push(eid);
            }
        }

        // Resize buffer if needed
        if (validSelection.length > this.selectionMesh.instanceMatrix.count) {
            // Recreate mesh logic omitted for brevity, usually you just alloc a big buffer (1000)
            // For this demo, we cap at 1000 or whatever was init
        }

        this.selectionMesh.count = validSelection.length;

        for (let i = 0; i < validSelection.length; i++) {
            const eid = validSelection[i];

            // Position ring at unit feet
            const currX = Position.x[eid];
            const currY = Position.y[eid];

            // Interpolate
            let prevX = currX;
            let prevY = currY;
            if (hasComponent(world, PrevPosition, eid)) {
                prevX = PrevPosition.x[eid];
                prevY = PrevPosition.y[eid];
            }
            const x = prevX + (currX - prevX) * alpha;
            const z = prevY + (currY - prevY) * alpha;

            this.dummy.position.set(x, 0.05, z); // Slightly above ground
            this.dummy.scale.set(1, 1, 1);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.updateMatrix();

            this.selectionMesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.selectionMesh.instanceMatrix.needsUpdate = true;

        this.renderer.render(this.scene, this.camera);
    }

    private positionDummy(eid: number, alpha: number, world: IWorld) {
        const currX = Position.x[eid];
        const currY = Position.y[eid];
        let prevX = currX;
        let prevY = currY;

        if (hasComponent(world, PrevPosition, eid)) {
            prevX = PrevPosition.x[eid];
            prevY = PrevPosition.y[eid];
        }

        const x = prevX + (currX - prevX) * alpha;
        const z = prevY + (currY - prevY) * alpha;

        this.dummy.position.set(x, 0.5, z);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
    }

    private getOrCreateInstancedMesh(modelId: number, capacity: number): THREE.InstancedMesh {
        if (this.meshGroups.has(modelId)) {
            const existing = this.meshGroups.get(modelId)!;
            if (existing.instanceMatrix.count >= capacity) return existing;
        }

        const geo = Assets.getGeometry(modelId);
        const mat = Assets.getMaterial(modelId);
        const mesh = new THREE.InstancedMesh(geo, mat, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.scene.add(mesh);
        this.meshGroups.set(modelId, mesh);
        return mesh;
    }

    getGroundIntersection(mouse: { x: number, y: number }): { x: number, y: number } | null {
        this.raycaster.setFromCamera(mouse, this.camera);
        const target = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
        if (hit) return { x: target.x, y: target.z };
        return null;
    }
}