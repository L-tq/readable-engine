import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class TitleScreen {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private animationId: number | null = null;
    private canvas: HTMLCanvasElement;

    // Animated objects
    private pivot: THREE.Group;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;

        // Setup separate scene for title
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a); // Darker simplistic background
        this.scene.fog = new THREE.FogExp2(0x0a0a0a, 0.02);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambient);

        const spotLight = new THREE.SpotLight(0x00ff00, 20);
        spotLight.position.set(5, 10, 5);
        spotLight.angle = Math.PI / 4;
        spotLight.penumbra = 0.5;
        this.scene.add(spotLight);

        const purpleLight = new THREE.PointLight(0x8800ff, 10, 20);
        purpleLight.position.set(-5, 2, -5);
        this.scene.add(purpleLight);

        // Create content
        this.pivot = new THREE.Group();
        this.scene.add(this.pivot);

        // Load Voxel Cat
        const loader = new GLTFLoader();
        loader.load('/game-data/assets/models/ui/cat_voxel.gltf', (gltf) => {
            const model = gltf.scene;
            // Center it?
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center); // Center pivot

            // Initial scale might be needed depending on the original GLB size
            model.scale.set(5, 5, 5);

            this.pivot.add(model);
        }, undefined, (err) => {
            console.error("Failed to load title asset", err);

            // Fallback: Add a simple box if load fails
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            const cube = new THREE.Mesh(geometry, material);
            this.pivot.add(cube);
        });

        window.addEventListener('resize', this.onResize);
    }

    private onResize = () => {
        if (!this.canvas) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    start() {
        this.animate();
        this.canvas.style.display = 'block';
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        window.removeEventListener('resize', this.onResize);
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate);

        const time = Date.now() * 0.001;

        // Rotate entire group
        this.pivot.rotation.y = Math.sin(time * 0.2) * 0.5 + time * 0.1; // Spin slowly
        this.pivot.rotation.x = Math.cos(time * 0.1) * 0.1;

        this.renderer.render(this.scene, this.camera);
    }
}
