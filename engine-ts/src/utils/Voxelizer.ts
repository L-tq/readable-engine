import * as THREE from 'three';

export class Voxelizer {
    /**
     * Voxelizes a mesh into a single merged mesh of cubes.
     * @param originalMesh The mesh to voxelize
     * @param resolution The number of voxels along the longest axis
     */
    static voxelize(originalMesh: THREE.Mesh, resolution: number): THREE.Mesh {
        // 1. Compute Bounding Box
        originalMesh.updateMatrixWorld();
        const geometry = originalMesh.geometry.clone();
        geometry.applyMatrix4(originalMesh.matrixWorld);
        geometry.computeBoundingBox();

        const box = geometry.boundingBox!;
        const size = new THREE.Vector3();
        box.getSize(size);

        // 2. Determine Voxel Size
        const maxDim = Math.max(size.x, size.y, size.z);
        const voxelSize = maxDim / resolution;

        // 3. Grid Traversal - Vertex Sampling Approach
        // Since the mesh is large, we iterate vertices and mark the voxels they fall into.

        const posAttribute = geometry.getAttribute('position');
        const voxelSet = new Set<string>();
        const instances: THREE.Matrix4[] = [];

        const tempVec = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
            tempVec.fromBufferAttribute(posAttribute, i);

            // Calculate grid index
            const x = Math.floor((tempVec.x - box.min.x) / voxelSize);
            const y = Math.floor((tempVec.y - box.min.y) / voxelSize);
            const z = Math.floor((tempVec.z - box.min.z) / voxelSize);

            const key = `${x},${y},${z}`;

            if (!voxelSet.has(key)) {
                voxelSet.add(key);

                // Create instance matrix
                const posX = box.min.x + x * voxelSize + voxelSize * 0.5;
                const posY = box.min.y + y * voxelSize + voxelSize * 0.5;
                const posZ = box.min.z + z * voxelSize + voxelSize * 0.5;

                const matrix = new THREE.Matrix4();
                matrix.setPosition(posX, posY, posZ);
                matrix.scale(new THREE.Vector3(voxelSize, voxelSize, voxelSize));

                instances.push(matrix);
            }
        }

        console.log(`Voxelizer: Generated ${instances.length} voxels from ${posAttribute.count} vertices.`);

        if (instances.length === 0) {
            console.warn("Voxelizer: No voxels generated!");
            return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        }

        // Efficient Merge
        const baseBox = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.8 });

        const instancedMesh = new THREE.InstancedMesh(baseBox, material, instances.length);
        for (let i = 0; i < instances.length; i++) {
            instancedMesh.setMatrixAt(i, instances[i]);
        }
        instancedMesh.updateMatrix();

        return instancedMesh;
    }
}
