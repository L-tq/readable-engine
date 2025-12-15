import * as THREE from 'three';

export class AssetManager {
    private cache = new Map<string, THREE.BufferGeometry>();
    private materialCache = new Map<string, THREE.Material>();

    // Map string names to numeric IDs for ECS
    private nameToId = new Map<string, number>();
    private idToName = new Map<number, string>();
    private nextId = 1;

    constructor() {
        // Default Material
        this.materialCache.set('default', new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
    }

    getModelId(name: string): number {
        if (!this.nameToId.has(name)) {
            const id = this.nextId++;
            this.nameToId.set(name, id);
            this.idToName.set(id, name);
            // Pre-generate placeholder immediately
            this.getGeometry(id);
        }
        return this.nameToId.get(name)!;
    }

    getGeometry(id: number): THREE.BufferGeometry {
        const name = this.idToName.get(id) || "Unknown";
        if (this.cache.has(name)) return this.cache.get(name)!;

        // --- PLACEHOLDER PROTOCOL ---
        // If geometry doesn't exist, generate a procedural fallback.
        console.warn(`[AssetManager] Generating placeholder for '${name}'`);

        // 1. Create a Box
        const geometry = new THREE.BoxGeometry(1, 1, 1);

        // 2. (Optional) In a real engine, we'd add text labels here via texture generation
        // For now, we just cache the box.
        this.cache.set(name, geometry);
        return geometry;
    }

    getMaterial(id: number): THREE.Material {
        const name = this.idToName.get(id);
        if (name === "Marine") return new THREE.MeshStandardMaterial({ color: 0x4488ff });
        if (name === "Enemy") return new THREE.MeshStandardMaterial({ color: 0xff4444 });
        return this.materialCache.get('default')!;
    }
}

export const Assets = new AssetManager();