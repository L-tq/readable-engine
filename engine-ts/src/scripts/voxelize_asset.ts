import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import canvasPkg from 'canvas';
import { TextDecoder, TextEncoder } from 'util';

// --- ENVIRONMENT POLYFILLS START ---

// 1. Critical Globals
global.TextDecoder = TextDecoder as any;
global.TextEncoder = TextEncoder as any;

const dom = new JSDOM('<!DOCTYPE html>');
const { window } = dom;
const { Canvas, Image: NodeCanvasImage } = canvasPkg;

// 2. Browser Globals
global.window = window as any;
global.document = window.document;
(global as any).self = window;
global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.HTMLImageElement = window.HTMLImageElement;

// Polyfill Uint8ClampedArray for ImageData
if (!global.Uint8ClampedArray) {
    (global as any).Uint8ClampedArray = window.Uint8ClampedArray;
}

// 3. Blob Polyfill
class NodeBlob {
    buffer: Buffer;
    size: number;
    type: string;

    constructor(parts: any[], options: any = {}) {
        const buffers: Buffer[] = [];
        for (const part of parts) {
            if (Buffer.isBuffer(part)) {
                buffers.push(part);
            } else if (part instanceof ArrayBuffer) {
                buffers.push(Buffer.from(part));
            } else if (ArrayBuffer.isView(part)) {
                buffers.push(Buffer.from(part.buffer, part.byteOffset, part.byteLength));
            } else {
                buffers.push(Buffer.from(String(part)));
            }
        }
        this.buffer = Buffer.concat(buffers);
        this.size = this.buffer.length;
        this.type = options.type || '';
    }

    slice(start?: number, end?: number, type?: string) {
        let s = start || 0;
        let e = end;
        if (s < 0) s = this.buffer.length + s;
        if (e && e < 0) e = this.buffer.length + e;
        return new NodeBlob([this.buffer.slice(s, e)], { type: type || this.type });
    }
}
global.Blob = NodeBlob as any;

// 4. FileReader Polyfill (Required by GLTFExporter)
class NodeFileReader {
    result: any = null;
    onload: any = null;
    onloadend: any = null;
    onerror: any = null;
    readyState: number = 0; // EMPTY

    readAsDataURL(blob: NodeBlob) {
        setTimeout(() => {
            try {
                const base64 = blob.buffer.toString('base64');
                const mime = blob.type || 'application/octet-stream';
                this.result = `data:${mime};base64,${base64}`;
                this.readyState = 2; // DONE
                if (this.onload) this.onload({ target: this });
                if (this.onloadend) this.onloadend({ target: this });
            } catch (e) {
                if (this.onerror) this.onerror({ target: this, error: e });
            }
        }, 1);
    }

    readAsArrayBuffer(blob: NodeBlob) {
        setTimeout(() => {
            try {
                // Return a fresh ArrayBuffer copy
                const ab = blob.buffer.buffer.slice(blob.buffer.byteOffset, blob.buffer.byteOffset + blob.buffer.byteLength);
                this.result = ab;
                this.readyState = 2;
                if (this.onload) this.onload({ target: this });
                if (this.onloadend) this.onloadend({ target: this });
            } catch (e) {
                if (this.onerror) this.onerror({ target: this, error: e });
            }
        }, 1);
    }

    readAsText(blob: NodeBlob) {
        setTimeout(() => {
            try {
                this.result = blob.buffer.toString('utf-8');
                this.readyState = 2;
                if (this.onload) this.onload({ target: this });
                if (this.onloadend) this.onloadend({ target: this });
            } catch (e) {
                if (this.onerror) this.onerror({ target: this, error: e });
            }
        }, 1);
    }
}
global.FileReader = NodeFileReader as any;

// 5. URL Polyfill
const blobStore = new Map<string, NodeBlob>();

const createObjectURL = (blob: any) => {
    const uuid = 'blob:nodedata:' + Math.random().toString(36).substr(2, 9);
    if (blob instanceof NodeBlob) {
        blobStore.set(uuid, blob);
    }
    return uuid;
};

const revokeObjectURL = (url: string) => {
    blobStore.delete(url);
};

if (!global.URL) (global as any).URL = {};
(global.URL as any).createObjectURL = createObjectURL;
(global.URL as any).revokeObjectURL = revokeObjectURL;
if (!window.URL) (window as any).URL = {};
(window.URL as any).createObjectURL = createObjectURL;
(window.URL as any).revokeObjectURL = revokeObjectURL;

// 6. Image Polyfill
class CustomImage extends NodeCanvasImage {
    private _listeners: Record<string, Function[]> = {};
    public crossOrigin: string = '';
    public tagName: string = 'IMG';

    constructor() {
        super();
    }

    addEventListener(type: string, listener: Function) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(listener);
    }

    removeEventListener(type: string, listener: Function) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter(fn => fn !== listener);
        }
    }

    private _dispatch(type: string, error?: any) {
        if (this._listeners[type]) {
            this._listeners[type].forEach(fn => {
                try { fn({ target: this, type, error }); } catch (e) { console.error(e); }
            });
        }
        // Also call 'on' properties which Three.js sometimes checks
        if (type === 'load' && (this as any).onload) (this as any).onload();
        if (type === 'error' && (this as any).onerror) (this as any).onerror(error);
    }

    get src() { return super.src as string; }

    set src(val: string | Buffer) {
        // 1. Handle Blob URLs
        if (typeof val === 'string' && val.startsWith('blob:nodedata:')) {
            const blob = blobStore.get(val);
            if (blob) {
                try {
                    // Synchronously load buffer into node-canvas
                    super.src = blob.buffer;
                    // Asynchronously fire load event to satisfy browser behavior
                    setTimeout(() => this._dispatch('load'), 1);
                } catch (e) {
                    console.error("[CustomImage] Blob Load Error:", e);
                    setTimeout(() => this._dispatch('error', e), 1);
                }
            } else {
                console.warn("[CustomImage] Blob missing:", val);
                setTimeout(() => this._dispatch('error', new Error('Blob missing')), 1);
            }
            return;
        }

        // 2. Standard URLs or Data URIs
        try {
            super.src = val;
            setTimeout(() => this._dispatch('load'), 1);
        } catch (e) {
            setTimeout(() => this._dispatch('error', e), 1);
        }
    }
}
global.Image = CustomImage as any;

// 7. createImageBitmap Polyfill (Preferred by GLTFLoader)
(global as any).createImageBitmap = function (blob: Blob | Buffer) {
    return new Promise((resolve, reject) => {
        const img = new CustomImage();
        if (blob instanceof NodeBlob) {
            try {
                // Bypass blob URL logic and load buffer directly
                img.src = blob.buffer as any;
                resolve(img);
            } catch (e) {
                reject(e);
            }
        } else {
            reject(new Error("Unknown blob type for createImageBitmap"));
        }
    });
};

// 8. DOM Element Creation Mock
const originalCreateElement = window.document.createElement;
window.document.createElement = function (tagName: string, options?: any) {
    if (tagName.toLowerCase() === 'canvas') return new Canvas(1, 1) as any;
    if (tagName.toLowerCase() === 'img') return new CustomImage() as any;
    return originalCreateElement.call(window.document, tagName, options);
} as any;

// --- POLYFILLS END ---

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Voxelizer } from '../utils/Voxelizer';

async function main() {
    const inputPath = path.resolve(process.cwd(), '../game-data/assets/models/ui/cat.glb');
    const outputPath = path.resolve(process.cwd(), '../game-data/assets/models/ui/cat_voxel.gltf');

    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found at: ${inputPath}`);
        process.exit(1);
    }

    const buffer = fs.readFileSync(inputPath);
    // Create a fresh ArrayBuffer to avoid Node Buffer offset issues
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    console.log(`[Voxel Script] Input size: ${arrayBuffer.byteLength} bytes.`);

    const loader = new GLTFLoader();

    await new Promise<void>((resolve, reject) => {
        loader.parse(
            arrayBuffer,
            '', // resourcePath
            (gltf) => {
                console.log("[Voxel Script] Model loaded successfully.");

                try {
                    // Find the main mesh
                    let mesh: THREE.Mesh | null = null;
                    gltf.scene.traverse((child) => {
                        if (mesh) return;
                        if ((child as THREE.Mesh).isMesh) {
                            mesh = child as THREE.Mesh;
                            console.log(`[Voxel Script] Found Mesh: ${mesh.name || 'Unnamed'}`);
                        }
                    });

                    if (!mesh) throw new Error("No mesh found in GLB!");

                    const resolution = 64;
                    console.log(`[Voxel Script] Voxelizing mesh at resolution ${resolution}...`);

                    // Voxelize (returns a standard THREE.Mesh now)
                    const voxelMesh = Voxelizer.voxelize(mesh, resolution);

                    if (!voxelMesh || !voxelMesh.geometry) {
                        throw new Error("Voxelization failed to produce geometry.");
                    }

                    console.log("[Voxel Script] Exporting to GLTF...");
                    const exporter = new GLTFExporter();

                    exporter.parse(
                        voxelMesh,
                        (result) => {
                            const outputStr = JSON.stringify(result, null, 2);
                            fs.writeFileSync(outputPath, outputStr);
                            console.log(`[Voxel Script] Saved to ${outputPath}`);
                            resolve();
                        },
                        (err) => {
                            console.error("Export failed:", err);
                            reject(err);
                        },
                        { binary: false } // Change to true for .glb output
                    );

                } catch (e) {
                    console.error("Processing Error:", e);
                    reject(e);
                }
            },
            (err) => {
                console.error("GLTF Parse Error:", err);
                reject(err);
            }
        );
    });
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});