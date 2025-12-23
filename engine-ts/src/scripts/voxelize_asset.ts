import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import canvas from 'canvas';
import { TextEncoder, TextDecoder } from 'util';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { GLTFExporter } from 'three-stdlib';

// --- ESM Compatibility ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const INPUT_PATH = path.resolve(__dirname, '../../../game-data/assets/models/ui/cat.glb');
const OUTPUT_PATH = path.resolve(__dirname, '../../../game-data/assets/models/ui/cat_voxel.gltf');
const VOXEL_RESOLUTION = 32; // Grid size (e.g., 32x32x32)
const VOXEL_GAP = 0.0;       // 0.0 for solid blocks, 0.05 for slight separation

// --- 1. Robust Environment Polyfills (Blob Registry Pattern) ---

// Setup JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const globalAny = global as any;

globalAny.window = dom.window;
globalAny.document = dom.window.document;
globalAny.self = global;
globalAny.TextEncoder = TextEncoder;
globalAny.TextDecoder = TextDecoder;

// Blob Registry to handle URL.createObjectURL
const blobRegistry = new Map<string, { parts: any[], type: string }>();

class NodeBlob {
    parts: any[];
    options: any;
    constructor(parts: any[], options: any) {
        this.parts = parts;
        this.options = options || {};
    }
    get type() { return this.options.type || ''; }
}

globalAny.Blob = NodeBlob;
if (!globalAny.URL) globalAny.URL = {};

globalAny.URL.createObjectURL = (blob: any) => {
    const uuid = 'blob:node-id-' + Math.random().toString(36).substr(2, 9);
    blobRegistry.set(uuid, { parts: blob.parts, type: blob.type });
    return uuid;
};

globalAny.URL.revokeObjectURL = (url: string) => {
    blobRegistry.delete(url);
};

// Custom Image Class to Intercept Blob URLs
class NodeImage extends canvas.Image {
    constructor() {
        super();
        (this as any).style = {}; // Three.js touches .style
    }

    // Intercept the 'src' setter
    set src(val: string) {
        if (val.startsWith('blob:') && blobRegistry.has(val)) {
            // It's a blob URL we know! Convert to Data URI.
            const data = blobRegistry.get(val)!;
            const buffer = Buffer.concat(data.parts.map((p: any) =>
                p instanceof Uint8Array ? Buffer.from(p) : Buffer.from(p)
            ));

            // Default to PNG if type is missing, common in GLB
            const mimeType = data.type || 'image/png';
            const base64 = buffer.toString('base64');
            const dataUri = `data:${mimeType};base64,${base64}`;

            // Pass the Data URI to the real canvas.Image
            super.src = dataUri;
        } else {
            super.src = val;
        }
    }

    get src() { return super.src; }

    // Mock Event Listeners for Three.js
    addEventListener(type: string, listener: (e: any) => void) {
        if (type === 'load') {
            const oldOnLoad = this.onload;
            this.onload = () => { if (oldOnLoad) oldOnLoad(); listener({ type: 'load', target: this }); };
        } else if (type === 'error') {
            const oldOnError = this.onerror;
            this.onerror = (err) => { if (oldOnError) oldOnError(err); listener({ type: 'error', target: this, error: err }); };
        }
    }

    removeEventListener() { }
}

// Register Polyfills
globalAny.Image = NodeImage;
globalAny.HTMLImageElement = NodeImage;
globalAny.HTMLCanvasElement = canvas.Canvas;
globalAny.Canvas = canvas.Canvas;

// Override createElement to return our NodeImage
const originalCreateElement = dom.window.document.createElement;
dom.window.document.createElement = function (tagName: string, options?: any) {
    if (tagName.toLowerCase() === 'img') return new NodeImage();
    if (tagName.toLowerCase() === 'canvas') return new canvas.Canvas(1, 1);
    return originalCreateElement.apply(this, [tagName, options]);
} as any;


// --- 2. Voxelization Logic ---

function getTextureColor(texture: THREE.Texture, u: number, v: number): THREE.Color {
    if (!texture || !texture.image) return new THREE.Color(0xffffff);

    const image = texture.image as any;

    // Ensure we have a context
    if (!image.getContext && !image._ctx) {
        // It might be a raw Image object, draw it to a canvas once
        const w = image.width || 1;
        const h = image.height || 1;
        const c = canvas.createCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.drawImage(image, 0, 0);
        image._ctx = ctx;
        image._width = w;
        image._height = h;
    }

    const context = image.getContext ? image.getContext('2d') : image._ctx;
    const width = image.width || image._width;
    const height = image.height || image._height;

    if (!context) return new THREE.Color(0xffffff);

    // UV Wrapping
    u = u % 1; v = v % 1;
    if (u < 0) u += 1;
    if (v < 0) v += 1;

    // Map UV to XY
    // GLTF standard: (0,0) is top-left.
    const x = Math.floor(u * (width - 1));
    const y = Math.floor(v * (height - 1));

    try {
        const pixel = context.getImageData(x, y, 1, 1).data;
        // [R, G, B, A]
        return new THREE.Color().setRGB(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255);
    } catch (e) {
        return new THREE.Color(0xffffff);
    }
}

class ColorSurfaceSampler {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    positionAttribute: THREE.BufferAttribute;
    uvAttribute: THREE.BufferAttribute | null;
    colorAttribute: THREE.BufferAttribute | null;
    distribution: Float32Array | null = null;

    constructor(mesh: THREE.Mesh) {
        let geometry = mesh.geometry;
        if (geometry.index) geometry = geometry.toNonIndexed();
        this.geometry = geometry;
        this.material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        this.positionAttribute = this.geometry.getAttribute('position') as THREE.BufferAttribute;
        this.uvAttribute = this.geometry.getAttribute('uv') as THREE.BufferAttribute;
        this.colorAttribute = this.geometry.getAttribute('color') as THREE.BufferAttribute;
        this.build();
    }

    private build() {
        const posAttr = this.positionAttribute;
        const count = posAttr.count / 3;
        this.distribution = new Float32Array(count);
        const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
        let totalArea = 0;
        for (let i = 0; i < count; i++) {
            v1.fromBufferAttribute(posAttr, i * 3);
            v2.fromBufferAttribute(posAttr, i * 3 + 1);
            v3.fromBufferAttribute(posAttr, i * 3 + 2);
            v1.sub(v3); v2.sub(v3); v1.cross(v2);
            const area = v1.length() * 0.5;
            this.distribution[i] = totalArea + area;
            totalArea += area;
        }
    }

    sample(targetPos: THREE.Vector3, targetColor: THREE.Color) {
        if (!this.distribution) return;
        const total = this.distribution[this.distribution.length - 1];
        const r = Math.random() * total;

        // Binary Search for Triangle
        let idx = 0, start = 0, end = this.distribution.length - 1;
        while (start <= end) {
            const mid = (start + end) >>> 1;
            if (mid === 0 || (this.distribution[mid - 1] <= r && this.distribution[mid] > r)) {
                idx = mid; break;
            } else if (r < this.distribution[mid]) end = mid - 1;
            else start = mid + 1;
        }

        // Random Point in Triangle
        const r1 = Math.random(), r2 = Math.random();
        const sq1 = Math.sqrt(r1);
        const u = 1 - sq1, v = sq1 * (1 - r2), w = sq1 * r2;
        const i3 = idx * 3;

        // Interpolate Position
        const pA = new THREE.Vector3().fromBufferAttribute(this.positionAttribute, i3);
        const pB = new THREE.Vector3().fromBufferAttribute(this.positionAttribute, i3 + 1);
        const pC = new THREE.Vector3().fromBufferAttribute(this.positionAttribute, i3 + 2);
        targetPos.set(0, 0, 0).addScaledVector(pA, u).addScaledVector(pB, v).addScaledVector(pC, w);

        // Interpolate Color
        const mat = this.material as any;

        // 1. Texture Map
        if (mat.map && this.uvAttribute) {
            const uvA = new THREE.Vector2().fromBufferAttribute(this.uvAttribute, i3);
            const uvB = new THREE.Vector2().fromBufferAttribute(this.uvAttribute, i3 + 1);
            const uvC = new THREE.Vector2().fromBufferAttribute(this.uvAttribute, i3 + 2);
            const finalUV = new THREE.Vector2().addScaledVector(uvA, u).addScaledVector(uvB, v).addScaledVector(uvC, w);

            targetColor.copy(getTextureColor(mat.map, finalUV.x, finalUV.y));

            // Tint with material color
            if (mat.color) targetColor.multiply(mat.color);
        }
        // 2. Vertex Colors
        else if (this.colorAttribute) {
            const cA = new THREE.Color().fromBufferAttribute(this.colorAttribute, i3);
            const cB = new THREE.Color().fromBufferAttribute(this.colorAttribute, i3 + 1);
            const cC = new THREE.Color().fromBufferAttribute(this.colorAttribute, i3 + 2);
            targetColor.setRGB(0, 0, 0)
                .addScaledVector(new THREE.Vector3(cA.r, cA.g, cA.b), u)
                .addScaledVector(new THREE.Vector3(cB.r, cB.g, cB.b), v)
                .addScaledVector(new THREE.Vector3(cC.r, cC.g, cC.b), w);
        }
        // 3. Basic Material Color
        else if (mat.color) {
            targetColor.copy(mat.color);
        } else {
            targetColor.set(0xffffff);
        }
    }
}

// --- 3. Main Execution ---

async function main() {
    console.log(`\n--- Voxelizer (Blob Registry) ---`);
    console.log(`Input: ${INPUT_PATH}`);

    if (!fs.existsSync(INPUT_PATH)) throw new Error("Input file not found");

    const buffer = fs.readFileSync(INPUT_PATH);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const loader = new GLTFLoader();

    console.log("Parsing GLB...");

    // Wrap parse in Promise
    const gltf = await new Promise<THREE.GLTF>((resolve, reject) => {
        loader.parse(arrayBuffer, '', resolve, reject);
    });
    console.log("GLB Parsed successfully.");

    const scene = gltf.scene;
    const meshes: THREE.Mesh[] = [];
    const box = new THREE.Box3();

    scene.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
            const m = c as THREE.Mesh;
            m.updateMatrixWorld(true);
            m.geometry.applyMatrix4(m.matrixWorld); // Bake global transform
            meshes.push(m);
            box.expandByObject(m);
        }
    });

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const voxelSize = maxDim / VOXEL_RESOLUTION;

    console.log(`Model Dimensions: ${size.toArray().map(n => n.toFixed(2)).join('x')}`);
    console.log(`Voxel Size: ${voxelSize.toFixed(4)}`);

    const voxelMap = new Map<string, THREE.Color>();
    const tempPos = new THREE.Vector3();
    const tempColor = new THREE.Color();
    const SAMPLE_DENSITY = 3.0;

    console.log("Sampling Surface...");

    for (const mesh of meshes) {
        const sampler = new ColorSurfaceSampler(mesh);
        if (!sampler.distribution) continue;

        const area = sampler.distribution[sampler.distribution.length - 1];
        // Calculate needed samples to cover area
        const count = Math.ceil((area / (voxelSize * voxelSize)) * SAMPLE_DENSITY * 10);

        for (let i = 0; i < count; i++) {
            sampler.sample(tempPos, tempColor);

            const gx = Math.floor(tempPos.x / voxelSize);
            const gy = Math.floor(tempPos.y / voxelSize);
            const gz = Math.floor(tempPos.z / voxelSize);
            const key = `${gx},${gy},${gz}`;

            if (!voxelMap.has(key)) {
                voxelMap.set(key, tempColor.clone());
            }
        }
    }

    console.log(`Generated ${voxelMap.size} voxels.`);

    // Build InstancedMesh for Export
    const geometry = new THREE.BoxGeometry(
        voxelSize - VOXEL_GAP,
        voxelSize - VOXEL_GAP,
        voxelSize - VOXEL_GAP
    );
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1
    });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, voxelMap.size);
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    let i = 0;
    for (const [key, col] of voxelMap.entries()) {
        const [gx, gy, gz] = key.split(',').map(Number);

        pos.set(
            gx * voxelSize + voxelSize / 2,
            gy * voxelSize + voxelSize / 2,
            gz * voxelSize + voxelSize / 2
        );

        matrix.compose(pos, quat, scale);
        instancedMesh.setMatrixAt(i, matrix);
        instancedMesh.setColorAt(i, col);
        i++;
    }

    const exportScene = new THREE.Scene();
    exportScene.add(instancedMesh);

    console.log("Exporting...");
    const exporter = new GLTFExporter();
    exporter.parse(
        exportScene,
        (result) => {
            const output = JSON.stringify(result, null, 2);
            fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
            fs.writeFileSync(OUTPUT_PATH, output);
            console.log(`Success! Saved to ${OUTPUT_PATH}`);
            process.exit(0);
        },
        (err) => { console.error(err); process.exit(1); },
        { binary: false }
    );
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});