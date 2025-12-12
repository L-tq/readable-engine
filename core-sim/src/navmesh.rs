use glam::DVec2;

#[derive(Clone)]
pub struct Triangle {
    pub id: usize,
    pub vertices: [DVec2; 3],
    pub neighbors: [Option<usize>; 3], // Indices of neighbor triangles
}

impl Triangle {
    pub fn center(&self) -> DVec2 {
        (self.vertices[0] + self.vertices[1] + self.vertices[2]) / 3.0
    }
}

pub struct NavMesh {
    pub triangles: Vec<Triangle>,
}

impl NavMesh {
    pub fn new() -> Self {
        Self { triangles: Vec::new() }
    }

    // Simplified A* on Polygons
    pub fn find_path(&self, start: DVec2, end: DVec2) -> Vec<DVec2> {
        let start_tri = self.find_triangle(start);
        let end_tri = self.find_triangle(end);

        if start_tri.is_none() || end_tri.is_none() { return vec![]; }
        let start_idx = start_tri.unwrap();
        let end_idx = end_tri.unwrap();

        // Perform A* on triangle graph (Simplified implementation)
        // In a full implementation, use PriorityQueue here similar to FlowField
        let mut path_indices = vec![start_idx];
        if start_idx != end_idx {
            // Placeholder: Just connecting direct neighbors for demo
            // Real A* would search self.triangles[i].neighbors
            path_indices.push(end_idx); 
        }

        // Apply Funnel Algorithm (String Pulling)
        self.string_pulling(start, end, &path_indices)
    }

    fn find_triangle(&self, point: DVec2) -> Option<usize> {
        for tri in &self.triangles {
            if self.point_in_triangle(point, tri.vertices) {
                return Some(tri.id);
            }
        }
        None
    }

    fn point_in_triangle(&self, p: DVec2, v: [DVec2; 3]) -> bool {
        // Barycentric coordinate check
        let v0 = v[2] - v[0];
        let v1 = v[1] - v[0];
        let v2 = p - v[0];

        let dot00 = v0.dot(v0);
        let dot01 = v0.dot(v1);
        let dot02 = v0.dot(v2);
        let dot11 = v1.dot(v1);
        let dot12 = v1.dot(v2);

        let inv_denom = 1.0 / (dot00 * dot11 - dot01 * dot01);
        let u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
        let v = (dot00 * dot12 - dot01 * dot02) * inv_denom;

        (u >= 0.0) && (v >= 0.0) && (u + v < 1.0)
    }

    // The "Funnel Algorithm"
    fn string_pulling(&self, start: DVec2, end: DVec2, tri_path: &[usize]) -> Vec<DVec2> {
        let mut points = vec![start];
        
        // Add portals (edges shared by triangles)
        // ... (Logic to find shared edges between tri_path[i] and tri_path[i+1])
        
        points.push(end);
        points
    }
}