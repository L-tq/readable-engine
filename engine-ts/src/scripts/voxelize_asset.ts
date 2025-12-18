
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Voxelizer } from '../utils/Voxelizer';
import fs from 'fs';
import path from 'path';

// Polyfills for Node.js environment
import { JSDOM } from 'jsdom';
const dom = new JSDOM();
global.window = dom.window as any;
global.document = dom.window.document;
global.self = global.window;
global.TextDecoder = TextDecoder;
global.FileReader = dom.window.FileReader;
global.Blob = dom.window.Blob;
global.File = dom.window.File;

// Image polyfill might be needed for textures if GLTFLoader tries to load them
// but for geometry only, we might get away with it.
// If not, we can simple-mock Image.
global.Image = dom.window.Image;

async function main() {
    const inputPath = path.resolve(process.cwd(), '../game-data/assets/models/ui/cat.glb');
    const outputPath = path.resolve(process.cwd(), '../game-data/assets/models/ui/cat_voxel.gltf');

    console.log(`[Voxel Script] Loading ${inputPath}...`);

    if (!fs.existsSync(inputPath)) {
        console.error("Input file not found!");
        process.exit(1);
    }

    const buffer = fs.readFileSync(inputPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const loader = new GLTFLoader();

    // Parse
    loader.parse(arrayBuffer, '', (gltf) => {
        console.log("[Voxel Script] Model loaded. Processing...");

        const scene = gltf.scene;
        let mesh: THREE.Mesh | null = null;

        // Find the first mesh
        scene.traverse((child) => {
            if (mesh) return;
            if ((child as THREE.Mesh).isMesh) {
                mesh = child as THREE.Mesh;
            }
        });

        if (!mesh) {
            console.error("No mesh found in GLB!");
            process.exit(1);
        }

        console.log(`[Voxel Script] Voxelizing mesh "${mesh.name}"...`);
        const resolution = 32; // Voxels axis size
        const voxelMesh = Voxelizer.voxelize(mesh, resolution);

        // Apply a material
        voxelMesh.material = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            roughness: 0.8,
        });
        voxelMesh.name = "VoxelCat";

        console.log("[Voxel Script] Exporting...");
        const exporter = new GLTFExporter();

        exporter.parse(
            voxelMesh,
            (result) => {
                const outputStr = JSON.stringify(result, null, 2);
                fs.writeFileSync(outputPath, outputStr);
                console.log(`[Voxel Script] Saved to ${outputPath}`);
            },
            (err) => {
                console.error("Export failed", err);
            },
            { binary: false }
        );

    }, (err) => {
        console.error("Load failed", err);
    });
}

main().catch(console.error);
