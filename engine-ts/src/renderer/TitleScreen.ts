import * as THREE from 'three';

export class TitleScreen {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private animationId: number | null = null;
    private canvas: HTMLCanvasElement;

    // Animated objects
    private cubes: THREE.Mesh[] = [];
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

        // Add some floating geometric shapes
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.2,
            metalness: 0.8
        });

        for (let i = 0; i < 20; i++) {
            const cube = new THREE.Mesh(geometry, material);
            cube.position.x = (Math.random() - 0.5) * 15;
            cube.position.y = (Math.random() - 0.5) * 5;
            cube.position.z = (Math.random() - 0.5) * 15;
            cube.rotation.x = Math.random() * Math.PI;
            cube.rotation.y = Math.random() * Math.PI;

            const scale = Math.random() * 0.5 + 0.5;
            cube.scale.set(scale, scale, scale);

            this.pivot.add(cube);
            this.cubes.push(cube);
        }

        // Add a central "Core" object
        const coreGeo = new THREE.IcosahedronGeometry(2, 1);
        const coreMat = new THREE.MeshPhongMaterial({
            color: 0x00ff88,
            emissive: 0x004422,
            shininess: 50,
            wireframe: true
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        this.pivot.add(core);

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
        // We don't dispose renderer as we reuse the canvas, 
        // but we should clear the scene to free memory if we were being strict.
        // For now, just stopping the loop is enough.
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate);

        const time = Date.now() * 0.001;

        // Rotate entire group
        this.pivot.rotation.y = Math.sin(time * 0.2) * 0.5;
        this.pivot.rotation.x = Math.cos(time * 0.1) * 0.2;

        // Animate individual cubes
        this.cubes.forEach((cube, i) => {
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.02;
            cube.position.y += Math.sin(time + i) * 0.01;
        });

        this.renderer.render(this.scene, this.camera);
    }
}
