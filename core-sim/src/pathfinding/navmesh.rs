use crate::pathfinding::astar;
use glam::DVec2;
use serde::{Deserialize, Serialize};

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Triangle {
    pub id: usize,
    pub vertices: [DVec2; 3],
    /// Convention: neighbors[i] is the neighbor across the edge formed by
    /// vertices[i] and vertices[(i+1)%3].
    pub neighbors: [Option<usize>; 3],
}

impl Triangle {
    pub fn center(&self) -> DVec2 {
        (self.vertices[0] + self.vertices[1] + self.vertices[2]) / 3.0
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct NavMesh {
    pub triangles: Vec<Triangle>,
}

// ============================================================================
// NavMesh Implementation
// ============================================================================

impl NavMesh {
    pub fn new() -> Self {
        Self { triangles: Vec::new() }
    }

    /// Finds the shortest path from start to end using A* on the mesh graph,
    /// followed by the Funnel Algorithm to smooth the path.
    pub fn find_path(&self, start: DVec2, end: DVec2) -> Vec<DVec2> {
        let start_tri_idx = self.find_triangle(start);
        let end_tri_idx = self.find_triangle(end);

        if start_tri_idx.is_none() || end_tri_idx.is_none() {
            return vec![];
        }

        let start_idx = start_tri_idx.unwrap();
        let end_idx = end_tri_idx.unwrap();

        // 1. If in the same triangle, straight line
        if start_idx == end_idx {
            return vec![start, end];
        }

        // 2. Perform A* to get list of triangle indices
        let path_indices = self.compute_a_star(start_idx, end_idx);

        if path_indices.is_empty() {
            return vec![];
        }

        // 3. Apply Funnel Algorithm
        self.string_pulling(start, end, &path_indices)
    }

    fn find_triangle(&self, point: DVec2) -> Option<usize> {
        // In production, use a spatial partition (BVH or QuadTree) here.
        // Linear search is O(N) and slow for large meshes.
        for tri in &self.triangles {
            if self.point_in_triangle(point, tri.vertices) {
                return Some(tri.id);
            }
        }
        None
    }

    fn point_in_triangle(&self, p: DVec2, v: [DVec2; 3]) -> bool {
        // Robust Cross Product method (Same Side technique)
        fn sign(p1: DVec2, p2: DVec2, p3: DVec2) -> f64 {
            (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
        }

        let d1 = sign(p, v[0], v[1]);
        let d2 = sign(p, v[1], v[2]);
        let d3 = sign(p, v[2], v[0]);

        let has_neg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
        let has_pos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);

        !(has_neg && has_pos)
    }

    /// A* Implementation on the Triangle Graph using the generic helper.
    fn compute_a_star(&self, start_idx: usize, end_idx: usize) -> Vec<usize> {
        let end_center = self.triangles[end_idx].center();

        // 1. Define Neighbors Closure
        let get_neighbors = |idx: usize| -> Vec<(usize, f64)> {
            let current_tri = &self.triangles[idx];
            let current_center = current_tri.center();
            let mut neighbors = Vec::with_capacity(3);

            for &neighbor_opt in &current_tri.neighbors {
                if let Some(n_idx) = neighbor_opt {
                    let neighbor_tri = &self.triangles[n_idx];
                    // Cost is Euclidean distance between triangle centers
                    let dist = current_center.distance(neighbor_tri.center());
                    neighbors.push((n_idx, dist));
                }
            }
            neighbors
        };

        // 2. Define Heuristic Closure
        let get_heuristic = |idx: usize| -> f64 {
            let center = self.triangles[idx].center();
            center.distance(end_center)
        };

        // 3. Define Goal Closure
        let is_goal = |idx: usize| -> bool {
            idx == end_idx
        };

        // 4. Run Generic A*
        if let Some((_, path)) = astar::a_star(start_idx, get_neighbors, get_heuristic, is_goal) {
            path
        } else {
            vec![]
        }
    }

    /// The Funnel Algorithm (String Pulling)
    /// Converts a sequence of triangles into a sequence of straight lines (Portals)
    fn string_pulling(&self, start: DVec2, end: DVec2, tri_path: &[usize]) -> Vec<DVec2> {
        let mut points = vec![];
        points.push(start);

        // 1. Build Portals (Left and Right vertices of shared edges)
        let mut portals = Vec::new();

        for i in 0..tri_path.len() - 1 {
            let curr = &self.triangles[tri_path[i]];
            let next = &self.triangles[tri_path[i + 1]];

            // Find shared edge
            if let Some((left, right)) = self.find_shared_edge(curr, next) {
                portals.push((left, right));
            }
        }

        // Add the end point as the final "portal" of width 0
        portals.push((end, end));

        // 2. Process Funnel
        let mut portal_apex = start;
        let mut portal_left = portals[0].0;
        let mut portal_right = portals[0].1;

        // Indices to track where the left/right sides of the funnel are
        let mut left_index = 0;
        let mut right_index = 0;

        let mut i = 0;
        while i < portals.len() {
            let (left, right) = portals[i];

            // Update Right Side
            // If new right point is "inside" the funnel (to the left of current right side)
            if self.tri_area_2(portal_apex, portal_right, right) <= 0.0 {
                // If it also crosses the left side (funnel collapses)
                if portal_apex == portal_right || self.tri_area_2(portal_apex, portal_left, right) > 0.0 {
                    // Tighten the funnel
                    portal_right = right;
                    right_index = i;
                } else {
                    // Right crossed Left -> Add Left as a corner point
                    points.push(portal_left);
                    portal_apex = portal_left;
                    portal_left = portal_apex;
                    portal_right = portal_apex;

                    // Restart scan from the portal where the corner occurred
                    i = left_index;
                    left_index = i;
                    right_index = i;
                    i += 1;
                    continue;
                }
            }

            // Update Left Side
            // If new left point is "inside" the funnel (to the right of current left side)
            if self.tri_area_2(portal_apex, portal_left, left) >= 0.0 {
                // If it also crosses the right side (funnel collapses)
                if portal_apex == portal_left || self.tri_area_2(portal_apex, portal_right, left) < 0.0 {
                    // Tighten the funnel
                    portal_left = left;
                    left_index = i;
                } else {
                    // Left crossed Right -> Add Right as a corner point
                    points.push(portal_right);
                    portal_apex = portal_right;
                    portal_left = portal_apex;
                    portal_right = portal_apex;

                    // Restart scan
                    i = right_index;
                    left_index = i;
                    right_index = i;
                    i += 1;
                    continue;
                }
            }

            i += 1;
        }

        points.push(end);
        points
    }

    // Helper: Signed triangle area * 2.
    // Positive if CCW, Negative if CW, Zero if collinear.
    // Used to determine if a point is to the left or right of a vector (apex -> p2).
    fn tri_area_2(&self, a: DVec2, b: DVec2, c: DVec2) -> f64 {
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    }

    // Identifies the shared edge between two triangles and orients it relative to the path.
    // Returns (Left Vertex, Right Vertex)
    fn find_shared_edge(&self, curr: &Triangle, next: &Triangle) -> Option<(DVec2, DVec2)> {
        // Find the two vertices shared by both triangles
        let mut shared = Vec::with_capacity(2);
        let epsilon = 1e-5;

        for &v_curr in &curr.vertices {
            for &v_next in &next.vertices {
                if v_curr.distance_squared(v_next) < epsilon {
                    shared.push(v_curr);
                }
            }
        }

        if shared.len() != 2 {
            return None; // Should not happen in a valid mesh
        }

        let v1 = shared[0];
        let v2 = shared[1];

        // Determine which is Left and which is Right.
        // Assuming CCW winding order for triangles:
        // If we walk along the edge from v1 to v2, the 'inside' of 'curr' is on the left.
        // We need to know the order in 'curr'.

        // Find index of v1 in curr
        let idx_v1 = curr.vertices.iter().position(|&v| v.distance_squared(v1) < epsilon)?;
        let idx_v2 = curr.vertices.iter().position(|&v| v.distance_squared(v2) < epsilon)?;

        // If v2 follows v1 in CCW order (0->1, 1->2, 2->0), then edge is v1->v2.
        // In a NavMesh, traversing from Curr to Next means crossing the edge.
        // If the edge in Curr is v1->v2, then v2 is on the Left and v1 is on the Right
        // relative to the crossing direction.

        if (idx_v1 + 1) % 3 == idx_v2 {
            // Edge is v1 -> v2
            Some((v2, v1))
        } else {
            // Edge is v2 -> v1
            Some((v1, v2))
        }
    }
}