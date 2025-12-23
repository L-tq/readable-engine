#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        BEAUTIFUL VOXEL ART CONVERTER                          ║
║                                                                               ║
║  Converts 3D models (.glb/.gltf/.obj) to voxel art style                     ║
║  FIX: Now handles Multi-Material Scenes correctly preserving textures         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import numpy as np
import trimesh
from pathlib import Path
import json
import base64
import warnings
from PIL import Image

warnings.filterwarnings('ignore')

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

INPUT_PATH = './game-data/assets/models/ui/cat.glb'
OUTPUT_PATH = './game-data/assets/models/ui/cat_voxel.gltf'

VOXEL_RESOLUTION = 64      # Number of voxels along largest axis
VOXEL_GAP = 0.0           # Gap between voxels (0-0.5)
COLOR_QUANTIZATION = 1     # 1 = Original colors (Keep this 1 to debug color first)

# ═══════════════════════════════════════════════════════════════════════════════
# COLOR SAMPLING UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_barycentric_coords(point, v0, v1, v2):
    """Calculate barycentric coordinates for interpolation."""
    v0v1 = v1 - v0
    v0v2 = v2 - v0
    v0p = point - v0
    
    dot00 = np.dot(v0v1, v0v1)
    dot01 = np.dot(v0v1, v0v2)
    dot02 = np.dot(v0v1, v0p)
    dot11 = np.dot(v0v2, v0v2)
    dot12 = np.dot(v0v2, v0p)
    
    denom = dot00 * dot11 - dot01 * dot01
    if abs(denom) < 1e-10:
        return np.array([1/3, 1/3, 1/3])
    
    inv_denom = 1.0 / denom
    u = (dot11 * dot02 - dot01 * dot12) * inv_denom
    v = (dot00 * dot12 - dot01 * dot02) * inv_denom
    w = 1.0 - u - v
    
    return np.array([w, u, v])

def sample_texture_color(mesh, face_id, barycentric):
    """Sample color from texture using UV coordinates."""
    try:
        # Check visuals existence
        if not hasattr(mesh.visual, 'uv') or mesh.visual.uv is None:
            return None
        
        material = getattr(mesh.visual, 'material', None)
        if material is None:
            return None

        # Extract Image from Material (Handle Trimesh PBR & Simple Materials)
        image = None
        if hasattr(material, 'baseColorTexture') and material.baseColorTexture is not None:
             # PBR Material
            image = material.baseColorTexture
        elif hasattr(material, 'image') and material.image is not None:
            # Simple Material
            image = material.image
        
        # If we got a PIL Image, convert to numpy array
        if image is not None and not isinstance(image, np.ndarray):
            image = np.array(image)
            
        if image is None:
            return None

        # Get UV coordinates
        face_vertices = mesh.faces[face_id]
        uvs = mesh.visual.uv[face_vertices]
        
        # Interpolate UV
        interpolated_uv = np.dot(barycentric, uvs)
        
        # UV Wrapping and Pixel coordinates
        u, v = interpolated_uv[0] % 1.0, interpolated_uv[1] % 1.0
        h, w = image.shape[:2]
        
        # Note: GLTF UV origin is usually top-left, but OpenGL is bottom-left.
        # If colors look inverted vertically, flip the 'v' calculation.
        px = int(u * (w - 1))
        py = int((1.0 - v) * (h - 1)) # Flip V for standard UV mapping
        
        color = image[py, px]
        
        # Ensure RGBA
        if len(color) == 3:
            return np.append(color, 255).astype(np.uint8)
        return color.astype(np.uint8)
        
    except Exception:
        return None

def sample_color_from_mesh(mesh, point, face_id):
    """Sample color with fallback priority."""
    default_color = np.array([180, 180, 180, 255], dtype=np.uint8)
    
    try:
        face_vertices = mesh.faces[face_id]
        v0, v1, v2 = mesh.vertices[face_vertices]
        barycentric = get_barycentric_coords(point, v0, v1, v2)
        
        # 1. Texture
        color = sample_texture_color(mesh, face_id, barycentric)
        if color is not None: return color
        
        # 2. Vertex Colors
        if hasattr(mesh.visual, 'vertex_colors') and len(mesh.visual.vertex_colors) > 0:
            vertex_colors = mesh.visual.vertex_colors[face_vertices]
            color = np.dot(barycentric, vertex_colors)
            return color.astype(np.uint8)
        
        # 3. Face Colors
        if hasattr(mesh.visual, 'face_colors') and len(mesh.visual.face_colors) > 0:
            return mesh.visual.face_colors[face_id].astype(np.uint8)

        # 4. Material Base Color
        if hasattr(mesh.visual, 'material'):
            mat = mesh.visual.material
            # PBR
            if hasattr(mat, 'baseColorFactor') and mat.baseColorFactor is not None:
                c = np.array(mat.baseColorFactor)
                return (c * 255).astype(np.uint8) if c.max() <= 1.0 else c.astype(np.uint8)
            # Standard
            if hasattr(mat, 'main_color') and mat.main_color is not None:
                return mat.main_color.astype(np.uint8)

    except Exception as e:
        pass
    
    return default_color

# ═══════════════════════════════════════════════════════════════════════════════
# VOXELIZATION ENGINE (UPDATED)
# ═══════════════════════════════════════════════════════════════════════════════

def get_scene_meshes(input_path):
    """
    Load scene and return a list of INDIVIDUAL meshes with their transforms applied.
    We do NOT concatenate them to preserve texture maps.
    """
    scene = trimesh.load(str(input_path))
    meshes = []
    
    if isinstance(scene, trimesh.Trimesh):
        meshes.append(scene)
    elif isinstance(scene, trimesh.Scene):
        # Flatten scene graph
        for name, geometry in scene.geometry.items():
            # Get the transform for this node
            if name in scene.graph:
                transform, _ = scene.graph.get(name)
                # Create a copy so we don't mess up the original scene references
                m = geometry.copy()
                m.apply_transform(transform)
                meshes.append(m)
            else:
                # Some geometries might be instanced or handled differently,
                # but usually scene.dump() or iterating geometry + graph covers it.
                # A safer way to get everything as a list of distinct meshes:
                dump = scene.dump(concatenate=False) 
                if isinstance(dump, list):
                    meshes = dump
                else:
                    meshes = [dump]
                break 
    else:
        raise ValueError(f"Unknown format: {type(scene)}")
        
    return meshes

def voxelize_scene(meshes, resolution=32):
    """
    Voxelize multiple meshes into a single shared grid.
    """
    print("  ├─ Calculating global bounds...")
    
    # Calculate global bounds across all meshes
    all_bounds = np.array([m.bounds for m in meshes])
    min_bound = np.min(all_bounds[:, 0, :], axis=0)
    max_bound = np.max(all_bounds[:, 1, :], axis=0)
    
    dimensions = max_bound - min_bound
    max_dim = np.max(dimensions)
    
    # Add padding
    padding = max_dim * 0.05
    min_bound -= padding
    max_bound += padding
    
    # Calculate voxel size based on global resolution
    real_dim = np.max(max_bound - min_bound)
    voxel_size = real_dim / resolution
    
    print(f"  ├─ Voxel size: {voxel_size:.6f}")
    
    # Dictionary to store voxels: Key=(x,y,z), Value=Color
    # Using a dict prevents duplicate voxels at overlaps
    voxel_dict = {}
    
    print(f"  ├─ Processing {len(meshes)} sub-meshes...")
    
    for i, mesh in enumerate(meshes):
        print(f"  │  ├─ Mesh {i+1}: {len(mesh.vertices)} verts")
        
        try:
            # Voxelize this specific mesh using the global pitch
            # Note: trimesh.voxelized creates a grid aligned to the mesh unless specified.
            # To ensure alignment across multiple meshes, we need to map points carefully.
            
            # Method: Use trimesh's voxelizer, then convert to global grid indices
            local_grid = mesh.voxelized(pitch=voxel_size)
            
            # Get the centers of the filled voxels in world space
            # 'points' property returns the center of occupied voxels
            world_points = local_grid.points
            
            if len(world_points) == 0:
                continue

            # Find nearest point on the source mesh surface for color sampling
            closest_points, distances, face_ids = mesh.nearest.on_surface(world_points)
            
            # Convert world points to integer grid keys for our global map
            # This ensures perfect alignment between different meshes
            grid_indices = np.floor(world_points / voxel_size).astype(int)
            
            for j in range(len(world_points)):
                # Create a tuple key for dictionary
                key = tuple(grid_indices[j])
                
                # If we already have this voxel, you might want logic to decide 
                # which one keeps (e.g., closest to camera), but usually first or last wins.
                if key not in voxel_dict:
                    point = closest_points[j]
                    face_id = face_ids[j]
                    
                    color = sample_color_from_mesh(mesh, point, face_id)
                    
                    # Quantize
                    if COLOR_QUANTIZATION > 1:
                        color[:3] = (color[:3] // COLOR_QUANTIZATION) * COLOR_QUANTIZATION
                    
                    # Store center calculated from the discrete key to ensure perfect alignment
                    # (Optional: use the actual world_point from voxelizer)
                    voxel_center = (np.array(key) * voxel_size) + (voxel_size * 0.5)
                    
                    voxel_dict[key] = {
                        'center': voxel_center,
                        'color': color
                    }
                    
        except Exception as e:
            print(f"  │  └─ Warning: Mesh {i+1} failed voxelization: {e}")
            continue

    # Convert dict to list
    voxel_data = list(voxel_dict.values())
    print(f"  └─ Generated {len(voxel_data)} unique voxels")
    
    return voxel_data, voxel_size

# ═══════════════════════════════════════════════════════════════════════════════
# MESH BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def create_cube_geometry(center, size, gap=0.05):
    half = size * (0.5 - gap / 2)
    # 8 vertices
    v = np.array([
        [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
        [-1,-1, 1], [1,-1, 1], [1,1, 1], [-1,1, 1]
    ]) * half + center
    
    # 12 triangles (indices)
    f = np.array([
        [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], # Back, Front
        [0, 1, 5], [0, 5, 4], [3, 6, 2], [3, 7, 6], # Bottom, Top
        [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]  # Left, Right
    ])
    return v, f

def build_combined_mesh(voxel_data, voxel_size, gap=0.05):
    if not voxel_data: return None
    
    count = len(voxel_data)
    vertices = np.zeros((count * 8, 3), dtype=np.float32)
    faces = np.zeros((count * 12, 3), dtype=np.uint32)
    colors = np.zeros((count * 8, 4), dtype=np.uint8)
    
    for i, data in enumerate(voxel_data):
        v_local, f_local = create_cube_geometry(data['center'], voxel_size, gap)
        idx_v = i * 8
        idx_f = i * 12
        
        vertices[idx_v:idx_v+8] = v_local
        faces[idx_f:idx_f+12] = f_local + idx_v
        colors[idx_v:idx_v+8] = data['color']
        
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    mesh.visual.vertex_colors = colors
    return mesh

# ═══════════════════════════════════════════════════════════════════════════════
# GLTF EXPORT (MANUAL IS SAFER FOR VERTEX COLORS)
# ═══════════════════════════════════════════════════════════════════════════════

def export_gltf_manual(mesh, output_path):
    """
    Exports GLTF ensuring Vertex Colors are written as COLOR_0 accessor.
    Uses a neutral material to ensure colors show up un-tinted.
    """
    # Ensure data types
    vertices = mesh.vertices.astype(np.float32)
    indices = mesh.faces.flatten().astype(np.uint32)
    
    # Normalize colors to 0.0 - 1.0 floats for GLTF
    colors = mesh.visual.vertex_colors.astype(np.float32) / 255.0
    
    # Calculate normals if missing
    if mesh.vertex_normals is None:
        mesh.fix_normals()
    normals = mesh.vertex_normals.astype(np.float32)
    
    # Binary Blob Construction
    blob = bytearray()
    
    def add_buffer_view(data):
        offset = len(blob)
        blob.extend(data.tobytes())
        length = len(blob) - offset
        return offset, length

    pos_off, pos_len = add_buffer_view(vertices)
    norm_off, norm_len = add_buffer_view(normals)
    col_off, col_len = add_buffer_view(colors)
    ind_off, ind_len = add_buffer_view(indices)
    
    # Bounds
    min_pos = vertices.min(axis=0).tolist()
    max_pos = vertices.max(axis=0).tolist()
    
    gltf = {
        "asset": {"version": "2.0", "generator": "VoxelConverter_Fixed"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "VoxelObject"}],
        "materials": [{
            "name": "VertexColorMat",
            "pbrMetallicRoughness": {
                "baseColorFactor": [1, 1, 1, 1], # Multiply by vertex color
                "metallicFactor": 0.0,
                "roughnessFactor": 1.0
            },
            "doubleSided": True
        }],
        "meshes": [{
            "primitives": [{
                "attributes": {
                    "POSITION": 0,
                    "NORMAL": 1,
                    "COLOR_0": 2
                },
                "indices": 3,
                "material": 0
            }]
        }],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(vertices), "type": "VEC3", "min": min_pos, "max": max_pos}, # POS
            {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},  # NORM
            {"bufferView": 2, "componentType": 5126, "count": len(colors), "type": "VEC4"},   # COL (Float)
            {"bufferView": 3, "componentType": 5125, "count": len(indices), "type": "SCALAR"} # IND (Uint32)
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": pos_off, "byteLength": pos_len, "target": 34962},
            {"buffer": 0, "byteOffset": norm_off, "byteLength": norm_len, "target": 34962},
            {"buffer": 0, "byteOffset": col_off, "byteLength": col_len, "target": 34962},
            {"buffer": 0, "byteOffset": ind_off, "byteLength": ind_len, "target": 34963}
        ],
        "buffers": [{
            "byteLength": len(blob),
            "uri": "data:application/octet-stream;base64," + base64.b64encode(blob).decode('utf-8')
        }]
    }
    
    with open(output_path, 'w') as f:
        json.dump(gltf, f)

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print(f"┌─ Processing: {INPUT_PATH}")
    
    if not Path(INPUT_PATH).exists():
        print("└─ Error: Input file not found.")
        return

    # 1. Load Scenes as Separate Meshes (Fixes Texture Loss)
    try:
        meshes = get_scene_meshes(INPUT_PATH)
    except Exception as e:
        print(f"└─ Error loading mesh: {e}")
        return

    # 2. Voxelize globally
    voxel_data, voxel_size = voxelize_scene(meshes, VOXEL_RESOLUTION)
    
    if not voxel_data:
        print("└─ Error: No voxels generated.")
        return

    # 3. Build Mesh
    print("  ├─ Building voxel geometry...")
    final_mesh = build_combined_mesh(voxel_data, voxel_size, VOXEL_GAP)

    # 4. Export
    print(f"  ├─ Exporting to {OUTPUT_PATH}")
    Path(OUTPUT_PATH).parent.mkdir(parents=True, exist_ok=True)
    export_gltf_manual(final_mesh, OUTPUT_PATH)
    
    print("└─ Done.")

if __name__ == "__main__":
    main()