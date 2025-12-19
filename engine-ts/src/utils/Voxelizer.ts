import * as THREE from 'three';

export class Voxelizer {
    private static extractTextureData(material: THREE.Material): {
        data: Uint8ClampedArray;
        width: number;
        height: number;
    } | null {
        try {
            const mat = material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
            const map = mat.map;

            if (!map || !map.image) {
                console.log('[Voxelizer] No map or image found on material.');
                return null;
            }

            const img = map.image;
            // Handle node-canvas Image vs standard Image
            const width = (img as any).naturalWidth || (img as any).width;
            const height = (img as any).naturalHeight || (img as any).height;

            if (!width || !height) {
                console.warn(`[Voxelizer] Texture has invalid dimensions: ${width}x${height}`);
                return null;
            }

            // Create canvas for reading pixel data
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            try {
                // Ensure we are drawing the underlying node-canvas image if wrapped
                ctx.drawImage(img as any, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                return {
                    data: imageData.data,
                    width,
                    height
                };
            } catch (e) {
                console.warn('[Voxelizer] Failed to draw image to canvas:', e);
                return null;
            }

        } catch (e) {
            console.warn('[Voxelizer] General extraction error:', e);
            return null;
        }
    }

    private static sampleTextureColor(
        textureInfo: { data: Uint8ClampedArray; width: number; height: number },
        u: number,
        v: number
    ): THREE.Color {
        // Wrap UVs
        u = ((u % 1) + 1) % 1;
        v = ((v % 1) + 1) % 1;

        const px = Math.floor(u * (textureInfo.width - 1));
        // Flip Y for standard UV mapping
        const py = Math.floor((1 - v) * (textureInfo.height - 1));

        const idx = (py * textureInfo.width + px) * 4;
        const data = textureInfo.data;

        // Default to white if out of bounds
        if (idx < 0 || idx >= data.length) return new THREE.Color(1, 1, 1);

        // Check Alpha
        if (data[idx + 3] < 20) return new THREE.Color(1, 1, 1); // Or handle transparency

        return new THREE.Color(
            data[idx] / 255,
            data[idx + 1] / 255,
            data[idx + 2] / 255
        );
    }

    private static getMaterialColor(material: THREE.Material): THREE.Color {
        if ('color' in material && (material as any).color instanceof THREE.Color) {
            return (material as any).color.clone();
        }
        return new THREE.Color(1, 1, 1);
    }

    static voxelize(target: THREE.Object3D, resolution: number): THREE.Mesh {
        console.log(`[Voxelizer] Processing ${target.type}...`);

        let originalMesh: THREE.Mesh | null = null;

        if (target.type === 'Mesh') {
            originalMesh = target as THREE.Mesh;
        } else {
            target.traverse((child) => {
                if (originalMesh) return;
                if ((child as THREE.Mesh).isMesh) originalMesh = child as THREE.Mesh;
            });
        }

        if (!originalMesh || !originalMesh.geometry) {
            console.error('[Voxelizer] No Mesh found.');
            return new THREE.Mesh();
        }

        originalMesh.updateMatrixWorld(true);
        const geometry = originalMesh.geometry.clone();
        geometry.applyMatrix4(originalMesh.matrixWorld);
        geometry.computeBoundingBox();

        const box = geometry.boundingBox!;
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const voxelSize = maxDim / resolution;

        console.log(`[Voxelizer] Size: ${size.toArray().join('x')} | Voxel Size: ${voxelSize}`);

        const posAttribute = geometry.getAttribute('position');
        const colorAttribute = geometry.getAttribute('color');
        const uvAttribute = geometry.getAttribute('uv');

        const materials = Array.isArray(originalMesh.material) ? originalMesh.material : [originalMesh.material];
        const primaryMaterial = materials[0];

        const textureInfo = this.extractTextureData(primaryMaterial);
        const materialColor = this.getMaterialColor(primaryMaterial);

        console.log(`[Voxelizer] Color Source: ${textureInfo ? 'Texture Map' : 'Material Color'}`);

        // 1. Identify occupied voxels and their colors
        const voxelSet = new Map<string, { position: THREE.Vector3; color: THREE.Color }>();
        const tempVec = new THREE.Vector3();
        const tempUV = new THREE.Vector2();

        for (let i = 0; i < posAttribute.count; i++) {
            tempVec.fromBufferAttribute(posAttribute, i);

            const x = Math.floor((tempVec.x - box.min.x) / voxelSize);
            const y = Math.floor((tempVec.y - box.min.y) / voxelSize);
            const z = Math.floor((tempVec.z - box.min.z) / voxelSize);

            const key = `${x},${y},${z}`;

            if (!voxelSet.has(key)) {
                let voxelColor: THREE.Color;

                if (textureInfo && uvAttribute) {
                    tempUV.fromBufferAttribute(uvAttribute, i);
                    voxelColor = this.sampleTextureColor(textureInfo, tempUV.x, tempUV.y);
                } else if (colorAttribute) {
                    voxelColor = new THREE.Color();
                    voxelColor.fromBufferAttribute(colorAttribute, i);
                } else {
                    voxelColor = materialColor.clone();
                }

                // Center of the voxel
                const posX = box.min.x + x * voxelSize + voxelSize * 0.5;
                const posY = box.min.y + y * voxelSize + voxelSize * 0.5;
                const posZ = box.min.z + z * voxelSize + voxelSize * 0.5;

                voxelSet.set(key, {
                    position: new THREE.Vector3(posX, posY, posZ),
                    color: voxelColor
                });
            }
        }

        console.log(`[Voxelizer] Voxel count: ${voxelSet.size}`);

        // 2. Build a single merged mesh (more compatible with GLTF export than InstancedMesh)
        const baseGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const basePos = baseGeometry.getAttribute('position');
        const baseNormal = baseGeometry.getAttribute('normal');
        const baseIndex = baseGeometry.getIndex();

        const voxelCount = voxelSet.size;
        const vertexCount = basePos.count * voxelCount;
        const indexCount = baseIndex!.count * voxelCount;

        const outPositions = new Float32Array(vertexCount * 3);
        const outNormals = new Float32Array(vertexCount * 3);
        const outColors = new Float32Array(vertexCount * 3);
        const outIndices = new Uint32Array(indexCount);

        let vOffset = 0;
        let iOffset = 0;
        let indexBase = 0;

        for (const { position, color } of voxelSet.values()) {
            // Copy vertices
            for (let i = 0; i < basePos.count; i++) {
                // Position
                outPositions[vOffset * 3 + 0] = basePos.getX(i) + position.x;
                outPositions[vOffset * 3 + 1] = basePos.getY(i) + position.y;
                outPositions[vOffset * 3 + 2] = basePos.getZ(i) + position.z;

                // Normal
                outNormals[vOffset * 3 + 0] = baseNormal.getX(i);
                outNormals[vOffset * 3 + 1] = baseNormal.getY(i);
                outNormals[vOffset * 3 + 2] = baseNormal.getZ(i);

                // Color
                outColors[vOffset * 3 + 0] = color.r;
                outColors[vOffset * 3 + 1] = color.g;
                outColors[vOffset * 3 + 2] = color.b;

                vOffset++;
            }

            // Copy Indices
            for (let i = 0; i < baseIndex!.count; i++) {
                outIndices[iOffset++] = baseIndex!.getX(i) + indexBase;
            }
            indexBase += basePos.count;
        }

        const outGeometry = new THREE.BufferGeometry();
        outGeometry.setAttribute('position', new THREE.BufferAttribute(outPositions, 3));
        outGeometry.setAttribute('normal', new THREE.BufferAttribute(outNormals, 3));
        outGeometry.setAttribute('color', new THREE.BufferAttribute(outColors, 3));
        outGeometry.setIndex(new THREE.BufferAttribute(outIndices, 1));

        // Important: vertexColors: true tells Three.js/Exporter to use the 'color' attribute
        const outMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1
        });

        const finalMesh = new THREE.Mesh(outGeometry, outMaterial);
        finalMesh.name = "VoxelModel";

        return finalMesh;
    }
}