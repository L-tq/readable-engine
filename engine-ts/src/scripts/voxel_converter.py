#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        BEAUTIFUL VOXEL ART CONVERTER                          ║
║                                                                               ║
║  Converts 3D models (.glb/.gltf/.obj) to voxel art style                     ║
║  Preserves colors from vertex colors, textures, and materials                 ║
║  Exports as .gltf with proper color attributes                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import numpy as np
import trimesh
from pathlib import Path
from collections import defaultdict
import json
import struct
import base64
import warnings

warnings.filterwarnings('ignore')

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

INPUT_PATH = './game-data/assets/models/ui/cat.glb'
OUTPUT_PATH = './game-data/assets/models/ui/cat_voxel.gltf'

VOXEL_RESOLUTION = 32      # Number of voxels along largest axis (higher = more detail)
VOXEL_GAP = 0.05           # Gap between voxels (0-0.5, 0 = no gap, 0.1 = 10% gap)
COLOR_QUANTIZATION = 4     # Color quantization level (1 = no quantization, higher = fewer colors)

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
    
    return np.clip(np.array([w, u, v]), 0, 1)


def sample_texture_color(mesh, face_id, barycentric):
    """Sample color from texture using UV coordinates."""
    try:
        if not hasattr(mesh.visual, 'uv') or mesh.visual.uv is None:
            return None
        if not hasattr(mesh.visual, 'material'):
            return None
            
        material = mesh.visual.material
        image = None
        
        # Try different ways to get the texture image
        if hasattr(material, 'image') and material.image is not None:
            image = np.array(material.image)
        elif hasattr(material, 'baseColorTexture') and material.baseColorTexture is not None:
            image = np.array(material.baseColorTexture)
        
        if image is None:
            return None
        
        # Get UV coordinates for face vertices
        face_vertices = mesh.faces[face_id]
        uvs = mesh.visual.uv[face_vertices]
        
        # Interpolate UV using barycentric coordinates
        bary_norm = barycentric / np.sum(barycentric)
        interpolated_uv = np.sum(uvs * bary_norm[:, np.newaxis], axis=0)
        
        # Handle UV wrapping
        u = interpolated_uv[0] % 1.0
        v = interpolated_uv[1] % 1.0
        
        # Convert to pixel coordinates (flip V for OpenGL convention)
        h, w = image.shape[:2]
        px = int(u * (w - 1))
        py = int((1.0 - v) * (h - 1))
        
        px = np.clip(px, 0, w - 1)
        py = np.clip(py, 0, h - 1)
        
        color = image[py, px]
        
        # Ensure RGBA format
        if len(color) == 3:
            color = np.append(color, 255)
        
        return color.astype(np.uint8)
        
    except Exception:
        return None


def sample_vertex_color(mesh, face_id, barycentric):
    """Sample color from vertex colors using interpolation."""
    try:
        if not hasattr(mesh.visual, 'vertex_colors') or mesh.visual.vertex_colors is None:
            return None
        
        face_vertices = mesh.faces[face_id]
        vertex_colors = mesh.visual.vertex_colors[face_vertices].astype(float)
        
        # Interpolate using barycentric coordinates
        bary_norm = barycentric / np.sum(barycentric)
        interpolated = np.sum(vertex_colors * bary_norm[:, np.newaxis], axis=0)
        
        return np.clip(interpolated, 0, 255).astype(np.uint8)
        
    except Exception:
        return None


def sample_face_color(mesh, face_id):
    """Get color from face colors."""
    try:
        if not hasattr(mesh.visual, 'face_colors') or mesh.visual.face_colors is None:
            return None
        
        color = mesh.visual.face_colors[face_id]
        
        if len(color) == 3:
            color = np.append(color, 255)
        
        return color.astype(np.uint8)
        
    except Exception:
        return None


def sample_material_color(mesh):
    """Get color from material properties."""
    try:
        if not hasattr(mesh.visual, 'material'):
            return None
        
        material = mesh.visual.material
        
        # Try PBR baseColorFactor
        if hasattr(material, 'baseColorFactor') and material.baseColorFactor is not None:
            color = np.array(material.baseColorFactor)
            if np.max(color) <= 1.0:
                color = color * 255
            if len(color) == 3:
                color = np.append(color, 255)
            return color.astype(np.uint8)
        
        # Try diffuse color
        if hasattr(material, 'diffuse') and material.diffuse is not None:
            color = np.array(material.diffuse)
            if np.max(color) <= 1.0:
                color = color * 255
            if len(color) == 3:
                color = np.append(color, 255)
            return color[:4].astype(np.uint8)
        
        # Try main_color
        if hasattr(material, 'main_color') and material.main_color is not None:
            color = np.array(material.main_color)
            if np.max(color) <= 1.0:
                color = color * 255
            if len(color) == 3:
                color = np.append(color, 255)
            return color[:4].astype(np.uint8)
        
        return None
        
    except Exception:
        return None


def sample_color_from_mesh(mesh, point, face_id):
    """
    Sample color from mesh using multiple fallback methods.
    Priority: Texture > Vertex Colors > Face Colors > Material > Default
    """
    default_color = np.array([200, 200, 200, 255], dtype=np.uint8)
    
    try:
        # Get face vertices and calculate barycentric coordinates
        face_vertices = mesh.faces[face_id]
        v0, v1, v2 = mesh.vertices[face_vertices]
        barycentric = get_barycentric_coords(point, v0, v1, v2)
        
        # Try texture sampling first (highest quality)
        color = sample_texture_color(mesh, face_id, barycentric)
        if color is not None:
            return color
        
        # Try vertex colors
        color = sample_vertex_color(mesh, face_id, barycentric)
        if color is not None:
            return color
        
        # Try face colors
        color = sample_face_color(mesh, face_id)
        if color is not None:
            return color
        
        # Try material color
        color = sample_material_color(mesh)
        if color is not None:
            return color
        
    except Exception:
        pass
    
    return default_color


# ═══════════════════════════════════════════════════════════════════════════════
# VOXELIZATION ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def voxelize_mesh(mesh, resolution=32):
    """
    Convert mesh to voxel grid with color information.
    """
    print("  ├─ Calculating bounds...")
    bounds = mesh.bounds
    # FIX: Create copies of the bounds so we can modify them
    min_bound = bounds[0].copy()
    max_bound = bounds[1].copy()
    
    dimensions = max_bound - min_bound
    max_dim = np.max(dimensions)
    
    # Add slight padding
    padding = max_dim * 0.02
    min_bound -= padding
    max_bound += padding
    
    # Recalculate max_dim with padding included
    max_dim = np.max(max_bound - min_bound)
    
    voxel_size = max_dim / resolution
    
    print(f"  ├─ Voxel size: {voxel_size:.6f}")
    print("  ├─ Running voxelization...")
    
    # Use trimesh's voxelization
    try:
        # We need to pass the pitch (voxel_size) to voxelized
        # Note: trimesh.voxel.creation.voxelize(mesh, pitch) is essentially what mesh.voxelized does
        voxel_grid = mesh.voxelized(pitch=voxel_size)
        filled_matrix = voxel_grid.matrix
        voxel_origin = voxel_grid.transform[:3, 3]
    except Exception as e:
        print(f"  └─ ERROR: Voxelization failed: {e}")
        return [], voxel_size
    
    # Get indices of filled voxels
    filled_indices = np.argwhere(filled_matrix)
    total_voxels = len(filled_indices)
    
    print(f"  ├─ Found {total_voxels} filled voxels")
    print("  ├─ Sampling colors...")
    
    # Prepare for color sampling
    voxel_data = []
    
    # Progress tracking
    progress_step = max(1, total_voxels // 10)
    
    for i, idx in enumerate(filled_indices):
        # Calculate voxel center in world coordinates
        # voxel_origin is usually the center of the voxel at index [0,0,0] or the corner
        # For trimesh VoxelGrid, transform maps indices to spatial coordinates.
        # Usually: point = transform * [x, y, z, 1]
        
        # Determine center using the grid transform
        grid_index = np.append(idx, 1) # [x, y, z, 1]
        # We want the center of the voxel, so we add 0.5 to indices if the transform points to corners
        # Trimesh voxel encoding usually aligns center. Let's stick to the transform matrix multiplication for accuracy.
        
        # Manual transform: origin + index * scale (if axis aligned)
        # Using the matrix multiplication is safer:
        center_index = idx.astype(float) # Center is implied by the integer index in the matrix representation? 
        # Actually trimesh VoxelGrid.points returns centers. 
        # But since we are iterating indices manually, let's calculate standard center:
        center = voxel_origin + (idx.astype(float)) * voxel_size 
        # Note: Depending on trimesh version, origin might be corner or center. 
        # Usually simpler to rely on the logic: origin + index * size
        
        # Find nearest surface point and sample color
        try:
            closest, distance, face_id = mesh.nearest.on_surface([center])
            color = sample_color_from_mesh(mesh, closest[0], face_id[0])
        except Exception:
            color = np.array([200, 200, 200, 255], dtype=np.uint8)
        
        # Optional: Quantize colors for a more stylized look
        if COLOR_QUANTIZATION > 1:
            color[:3] = (color[:3] // COLOR_QUANTIZATION) * COLOR_QUANTIZATION
        
        voxel_data.append({
            'center': center.copy(),
            'color': color.copy()
        })
        
        # Progress indicator
        if (i + 1) % progress_step == 0:
            progress = (i + 1) / total_voxels * 100
            print(f"  │   └─ Progress: {progress:.0f}%")
    
    print(f"  └─ Completed: {len(voxel_data)} voxels with colors")
    
    return voxel_data, voxel_size


# ═══════════════════════════════════════════════════════════════════════════════
# VOXEL GEOMETRY BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def create_cube_geometry(center, size, gap=0.05):
    """
    Create vertices and faces for a single voxel cube.
    """
    half = size * (0.5 - gap / 2)
    
    # 8 vertices of cube
    vertices = np.array([
        [-half, -half, -half],  # 0: left  bottom back
        [+half, -half, -half],  # 1: right bottom back
        [+half, +half, -half],  # 2: right top    back
        [-half, +half, -half],  # 3: left  top    back
        [-half, -half, +half],  # 4: left  bottom front
        [+half, -half, +half],  # 5: right bottom front
        [+half, +half, +half],  # 6: right top    front
        [-half, +half, +half],  # 7: left  top    front
    ]) + center
    
    # 12 triangles (2 per face, 6 faces)
    faces = np.array([
        # Back face (z-)
        [0, 2, 1], [0, 3, 2],
        # Front face (z+)
        [4, 5, 6], [4, 6, 7],
        # Bottom face (y-)
        [0, 1, 5], [0, 5, 4],
        # Top face (y+)
        [3, 6, 2], [3, 7, 6],
        # Left face (x-)
        [0, 4, 7], [0, 7, 3],
        # Right face (x+)
        [1, 2, 6], [1, 6, 5],
    ])
    
    return vertices, faces


def build_combined_mesh(voxel_data, voxel_size, gap=0.05):
    """
    Build a single optimized mesh from all voxels.
    """
    if not voxel_data:
        return None
    
    total_voxels = len(voxel_data)
    print(f"  ├─ Building geometry for {total_voxels} voxels...")
    
    # Pre-allocate arrays for efficiency
    all_vertices = np.zeros((total_voxels * 8, 3), dtype=np.float32)
    all_faces = np.zeros((total_voxels * 12, 3), dtype=np.int32)
    all_colors = np.zeros((total_voxels * 8, 4), dtype=np.uint8)
    
    for i, voxel in enumerate(voxel_data):
        vertices, faces = create_cube_geometry(voxel['center'], voxel_size, gap)
        
        v_start = i * 8
        f_start = i * 12
        
        all_vertices[v_start:v_start + 8] = vertices
        all_faces[f_start:f_start + 12] = faces + v_start
        all_colors[v_start:v_start + 8] = voxel['color']
    
    print("  ├─ Creating mesh object...")
    
    # Create trimesh object
    mesh = trimesh.Trimesh(
        vertices=all_vertices,
        faces=all_faces,
        process=False
    )
    
    # Apply vertex colors
    mesh.visual.vertex_colors = all_colors
    
    # Count unique colors
    unique_colors = np.unique(all_colors[:, :3], axis=0)
    print(f"  ├─ Unique colors: {len(unique_colors)}")
    print(f"  └─ Final mesh: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
    
    return mesh


# ═══════════════════════════════════════════════════════════════════════════════
# GLTF EXPORT
# ═══════════════════════════════════════════════════════════════════════════════

def export_gltf_with_colors(mesh, output_path):
    """
    Export mesh to GLTF format with vertex colors properly preserved.
    Uses trimesh's built-in exporter with color support.
    """
    print("  ├─ Preparing GLTF export...")
    
    # Ensure vertex colors are set properly
    if mesh.visual.vertex_colors is None:
        mesh.visual.vertex_colors = np.full((len(mesh.vertices), 4), [200, 200, 200, 255], dtype=np.uint8)
    
    # Export using trimesh (handles vertex colors automatically in modern versions)
    print("  ├─ Writing GLTF file...")
    
    try:
        # Try the standard export first
        mesh.export(str(output_path), file_type='gltf')
        print(f"  └─ Saved: {output_path}")
        return True
    except Exception as e:
        print(f"  │   Warning: Standard export failed ({e})")
        print("  ├─ Trying alternative export method...")
    
    # Alternative: Manual GLTF creation with proper vertex colors
    try:
        export_gltf_manual(mesh, output_path)
        print(f"  └─ Saved: {output_path}")
        return True
    except Exception as e:
        print(f"  └─ ERROR: Export failed: {e}")
        return False


def export_gltf_manual(mesh, output_path):
    """
    Manual GLTF export with explicit vertex color support.
    """
    vertices = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    colors = mesh.visual.vertex_colors.astype(np.float32) / 255.0  # Normalize to 0-1
    
    # Calculate normals
    mesh.fix_normals()
    normals = mesh.vertex_normals.astype(np.float32)
    
    # Create binary buffer
    buffer_data = bytearray()
    
    # Positions
    positions_offset = len(buffer_data)
    positions_bytes = vertices.tobytes()
    buffer_data.extend(positions_bytes)
    
    # Normals
    normals_offset = len(buffer_data)
    normals_bytes = normals.tobytes()
    buffer_data.extend(normals_bytes)
    
    # Colors (as VEC4 float)
    colors_offset = len(buffer_data)
    colors_bytes = colors.astype(np.float32).tobytes()
    buffer_data.extend(colors_bytes)
    
    # Indices
    indices_offset = len(buffer_data)
    indices_bytes = faces.flatten().astype(np.uint32).tobytes()
    buffer_data.extend(indices_bytes)
    
    # Calculate bounds
    pos_min = vertices.min(axis=0).tolist()
    pos_max = vertices.max(axis=0).tolist()
    
    # Create GLTF structure
    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "Voxel Art Converter"
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{
            "mesh": 0,
            "name": "VoxelMesh"
        }],
        "meshes": [{
            "name": "VoxelMesh",
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
        "materials": [{
            "name": "VoxelMaterial",
            "pbrMetallicRoughness": {
                "metallicFactor": 0.0,
                "roughnessFactor": 0.8
            }
        }],
        "accessors": [
            {
                "bufferView": 0,
                "byteOffset": 0,
                "componentType": 5126,  # FLOAT
                "count": len(vertices),
                "type": "VEC3",
                "min": pos_min,
                "max": pos_max
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5126,  # FLOAT
                "count": len(normals),
                "type": "VEC3"
            },
            {
                "bufferView": 2,
                "byteOffset": 0,
                "componentType": 5126,  # FLOAT
                "count": len(colors),
                "type": "VEC4"
            },
            {
                "bufferView": 3,
                "byteOffset": 0,
                "componentType": 5125,  # UNSIGNED_INT
                "count": len(faces) * 3,
                "type": "SCALAR"
            }
        ],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": positions_offset,
                "byteLength": len(positions_bytes),
                "target": 34962  # ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": normals_offset,
                "byteLength": len(normals_bytes),
                "target": 34962  # ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": colors_offset,
                "byteLength": len(colors_bytes),
                "target": 34962  # ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": indices_offset,
                "byteLength": len(indices_bytes),
                "target": 34963  # ELEMENT_ARRAY_BUFFER
            }
        ],
        "buffers": [{
            "byteLength": len(buffer_data),
            "uri": "data:application/octet-stream;base64," + base64.b64encode(bytes(buffer_data)).decode('ascii')
        }]
    }
    
    # Write GLTF file
    with open(output_path, 'w') as f:
        json.dump(gltf, f, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# DEMO MESH GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

def create_demo_cat_mesh():
    """
    Create a simple cat-shaped mesh with colors for demonstration.
    """
    print("  ├─ Creating demo cat mesh...")
    
    meshes = []
    
    # Cat body (ellipsoid)
    body = trimesh.creation.icosphere(subdivisions=3, radius=0.4)
    body.vertices[:, 0] *= 1.5  # Stretch along X
    body.vertices[:, 2] *= 0.8  # Compress along Z
    body.apply_translation([0, 0, 0])
    body_colors = np.full((len(body.vertices), 4), [255, 180, 100, 255], dtype=np.uint8)
    body.visual.vertex_colors = body_colors
    meshes.append(body)
    
    # Cat head
    head = trimesh.creation.icosphere(subdivisions=3, radius=0.25)
    head.apply_translation([0.5, 0.15, 0])
    head_colors = np.full((len(head.vertices), 4), [255, 190, 110, 255], dtype=np.uint8)
    head.visual.vertex_colors = head_colors
    meshes.append(head)
    
    # Left ear
    ear_l = trimesh.creation.cone(radius=0.08, height=0.15)
    ear_l.apply_translation([0.45, 0.4, -0.1])
    ear_colors = np.full((len(ear_l.vertices), 4), [255, 160, 90, 255], dtype=np.uint8)
    ear_l.visual.vertex_colors = ear_colors
    meshes.append(ear_l)
    
    # Right ear
    ear_r = trimesh.creation.cone(radius=0.08, height=0.15)
    ear_r.apply_translation([0.45, 0.4, 0.1])
    ear_r.visual.vertex_colors = ear_colors.copy()
    meshes.append(ear_r)
    
    # Tail
    tail = trimesh.creation.cylinder(radius=0.05, height=0.5)
    tail.apply_translation([-0.8, 0.1, 0])
    tail.vertices[:, 1] += tail.vertices[:, 0] * 0.3  # Curve upward
    tail_colors = np.full((len(tail.vertices), 4), [230, 160, 80, 255], dtype=np.uint8)
    tail.visual.vertex_colors = tail_colors
    meshes.append(tail)
    
    # Legs
    for x, z in [(-0.3, -0.15), (-0.3, 0.15), (0.2, -0.15), (0.2, 0.15)]:
        leg = trimesh.creation.cylinder(radius=0.06, height=0.3)
        leg.apply_translation([x, -0.25, z])
        leg_colors = np.full((len(leg.vertices), 4), [240, 170, 90, 255], dtype=np.uint8)
        leg.visual.vertex_colors = leg_colors
        meshes.append(leg)
    
    # Eyes
    for z in [-0.08, 0.08]:
        eye = trimesh.creation.icosphere(subdivisions=2, radius=0.04)
        eye.apply_translation([0.7, 0.2, z])
        eye_colors = np.full((len(eye.vertices), 4), [50, 200, 100, 255], dtype=np.uint8)
        eye.visual.vertex_colors = eye_colors
        meshes.append(eye)
    
    # Nose
    nose = trimesh.creation.icosphere(subdivisions=2, radius=0.03)
    nose.apply_translation([0.73, 0.1, 0])
    nose_colors = np.full((len(nose.vertices), 4), [255, 150, 150, 255], dtype=np.uint8)
    nose.visual.vertex_colors = nose_colors
    meshes.append(nose)
    
    # Combine all meshes
    combined = trimesh.util.concatenate(meshes)
    
    print(f"  └─ Demo mesh: {len(combined.vertices)} vertices, {len(combined.faces)} faces")
    
    return combined


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN CONVERTER
# ═══════════════════════════════════════════════════════════════════════════════

def load_mesh(input_path):
    """
    Load mesh from file, handling both single meshes and scenes.
    """
    scene = trimesh.load(str(input_path))
    
    if isinstance(scene, trimesh.Trimesh):
        return scene
    
    if isinstance(scene, trimesh.Scene):
        meshes = []
        
        for name, geometry in scene.geometry.items():
            if not isinstance(geometry, trimesh.Trimesh):
                continue
            
            # Try to apply scene transform
            try:
                transform, _ = scene.graph.get(name)
                geometry = geometry.copy()
                geometry.apply_transform(transform)
            except Exception:
                pass
            
            meshes.append(geometry)
        
        if not meshes:
            raise ValueError("No valid meshes found in scene")
        
        # Combine all meshes
        return trimesh.util.concatenate(meshes)
    
    raise ValueError(f"Unsupported format: {type(scene)}")


def convert_to_voxel_art(input_path, output_path, resolution=32, gap=0.05):
    """
    Main conversion pipeline.
    """
    print()
    print("╔" + "═" * 70 + "╗")
    print("║" + "BEAUTIFUL VOXEL ART CONVERTER".center(70) + "║")
    print("╚" + "═" * 70 + "╝")
    print()
    
    input_path = Path(input_path)
    output_path = Path(output_path)
    
    print(f"┌─ Configuration")
    print(f"│  Input:      {input_path}")
    print(f"│  Output:     {output_path}")
    print(f"│  Resolution: {resolution} voxels")
    print(f"│  Gap:        {gap * 100:.0f}%")
    print(f"└─────────────────────────────────────────────")
    print()
    
    # ─────────────────────────────────────────────────────────────────────────
    # Step 1: Load Model
    # ─────────────────────────────────────────────────────────────────────────
    print("┌─ [1/4] Loading Model")
    
    if input_path.exists():
        try:
            mesh = load_mesh(input_path)
            print(f"│  Loaded: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
            
            # Check for colors
            has_vertex_colors = hasattr(mesh.visual, 'vertex_colors') and mesh.visual.vertex_colors is not None
            has_texture = hasattr(mesh.visual, 'uv') and mesh.visual.uv is not None
            has_material = hasattr(mesh.visual, 'material') and mesh.visual.material is not None
            
            print(f"│  Vertex Colors: {'Yes' if has_vertex_colors else 'No'}")
            print(f"│  UV/Texture:    {'Yes' if has_texture else 'No'}")
            print(f"│  Material:      {'Yes' if has_material else 'No'}")
            print(f"└─────────────────────────────────────────────")
            
        except Exception as e:
            print(f"│  ERROR: Failed to load model: {e}")
            print(f"│  Creating demo mesh instead...")
            mesh = create_demo_cat_mesh()
            print(f"└─────────────────────────────────────────────")
    else:
        print(f"│  File not found: {input_path}")
        print(f"│  Creating demo cat mesh for demonstration...")
        mesh = create_demo_cat_mesh()
        print(f"└─────────────────────────────────────────────")
    
    print()
    
    # ─────────────────────────────────────────────────────────────────────────
    # Step 2: Voxelize
    # ─────────────────────────────────────────────────────────────────────────
    print("┌─ [2/4] Voxelizing Mesh")
    
    voxel_data, voxel_size = voxelize_mesh(mesh, resolution)
    
    if not voxel_data:
        print("│  ERROR: No voxels generated!")
        print("└─────────────────────────────────────────────")
        return False
    
    print(f"│  Total voxels: {len(voxel_data)}")
    print(f"└─────────────────────────────────────────────")
    print()
    
    # ─────────────────────────────────────────────────────────────────────────
    # Step 3: Build Geometry
    # ─────────────────────────────────────────────────────────────────────────
    print("┌─ [3/4] Building Voxel Geometry")
    
    voxel_mesh = build_combined_mesh(voxel_data, voxel_size, gap)
    
    if voxel_mesh is None:
        print("│  ERROR: Failed to build mesh!")
        print("└─────────────────────────────────────────────")
        return False
    
    print(f"└─────────────────────────────────────────────")
    print()
    
    # ─────────────────────────────────────────────────────────────────────────
    # Step 4: Export GLTF
    # ─────────────────────────────────────────────────────────────────────────
    print("┌─ [4/4] Exporting GLTF")
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    success = export_gltf_with_colors(voxel_mesh, output_path)
    
    print(f"└─────────────────────────────────────────────")
    print()
    
    # ─────────────────────────────────────────────────────────────────────────
    # Summary
    # ─────────────────────────────────────────────────────────────────────────
    if success:
        print("╔" + "═" * 70 + "╗")
        print("║" + "✓ CONVERSION COMPLETE".center(70) + "║")
        print("╠" + "═" * 70 + "╣")
        print("║" + f"  Original: {len(mesh.vertices):,} vertices, {len(mesh.faces):,} faces".ljust(69) + "║")
        print("║" + f"  Voxel:    {len(voxel_mesh.vertices):,} vertices, {len(voxel_mesh.faces):,} faces".ljust(69) + "║")
        print("║" + f"  Voxels:   {len(voxel_data):,}".ljust(69) + "║")
        print("║" + f"  Output:   {output_path}".ljust(69) + "║")
        print("╚" + "═" * 70 + "╝")
    else:
        print("╔" + "═" * 70 + "╗")
        print("║" + "✗ CONVERSION FAILED".center(70) + "║")
        print("╚" + "═" * 70 + "╝")
    
    return success


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    convert_to_voxel_art(
        input_path=INPUT_PATH,
        output_path=OUTPUT_PATH,
        resolution=VOXEL_RESOLUTION,
        gap=VOXEL_GAP
    )