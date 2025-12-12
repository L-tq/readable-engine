use crate::pathfinding::astar;
use glam::IVec2;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

// ============================================================================
// Data Structures
// ============================================================================

/// Represents a location in the abstract graph (a specific portal).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PortalId(pub usize);

/// A node in the abstract graph representing a transition between clusters.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PortalNode {
    pub id: PortalId,
    pub pos: IVec2,
    pub cluster_xy: IVec2,
}

/// An edge in the abstract graph.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AbstractEdge {
    pub to: PortalId,
    pub cost: u32,
    /// If true, this is a transition between clusters (len 1).
    /// If false, it is a path inside a cluster.
    pub is_inter_cluster: bool, 
    /// If this is an intra-cluster edge, we might cache the actual path here
    /// for fast reconstruction, but for memory efficiency we often re-compute it.
    pub cached_path: Option<Vec<IVec2>>, 
}

/// The map data (walls/floors).
#[derive(Clone, Serialize, Deserialize)]
pub struct GridMap {
    pub width: i32,
    pub height: i32,
    /// Row-major grid: index = y * width + x. True = Wall, False = Walkable.
    pub walls: Vec<bool>,
}

impl GridMap {
    pub fn new(width: i32, height: i32) -> Self {
        Self {
            width,
            height,
            walls: vec![false; (width * height) as usize],
        }
    }

    pub fn is_walkable(&self, pos: IVec2) -> bool {
        if pos.x < 0 || pos.x >= self.width || pos.y < 0 || pos.y >= self.height {
            return false;
        }
        !self.walls[(pos.y * self.width + pos.x) as usize]
    }

    pub fn set_obstacle(&mut self, pos: IVec2, is_wall: bool) {
        if pos.x >= 0 && pos.x < self.width && pos.y >= 0 && pos.y < self.height {
            self.walls[(pos.y * self.width + pos.x) as usize] = is_wall;
        }
    }
}

// ============================================================================
// HPA Implementation
// ============================================================================

#[derive(Clone, Serialize, Deserialize)]
pub struct HPAGrid {
    pub grid: GridMap,
    pub cluster_size: i32,
    
    /// All portal nodes indexed by their ID.
    pub portals: Vec<PortalNode>,
    
    /// Adjacency list: PortalId -> List of Edges.
    pub graph: Vec<Vec<AbstractEdge>>,
    
    /// Spatial lookup: Map Cluster Coordinate (x,y) -> List of Portal IDs in that cluster.
    /// Using String key "x,y" for simple JSON compatibility.
    pub cluster_lookup: HashMap<String, Vec<PortalId>>,
}

impl HPAGrid {
    pub fn new(grid: GridMap, cluster_size: i32) -> Self {
        Self {
            grid,
            cluster_size,
            portals: Vec::new(),
            graph: Vec::new(),
            cluster_lookup: HashMap::new(),
        }
    }

    /// Full build pipeline: Detect portals, build edges, finalize graph.
    pub fn build(&mut self) {
        self.portals.clear();
        self.graph.clear();
        self.cluster_lookup.clear();

        // 1. Detect Portals along cluster boundaries
        self.create_portals();

        // 2. Initialize Adjacency List
        self.graph.resize(self.portals.len(), Vec::new());

        // 3. Connect Inter-Cluster edges (Portal <-> Portal neighbors)
        self.build_inter_cluster_edges();

        // 4. Connect Intra-Cluster edges (Portal <-> Portal within same chunk)
        self.build_intra_cluster_edges();
    }

    /// Scans grid boundaries to place portals.
    fn create_portals(&mut self) {
        let clusters_w = (self.grid.width + self.cluster_size - 1) / self.cluster_size;
        let clusters_h = (self.grid.height + self.cluster_size - 1) / self.cluster_size;

        // FIX: We split the borrows here.
        // `grid` is borrowed immutably.
        // `portals` and `cluster_lookup` are borrowed mutably.
        // This prevents the "cannot borrow *self as immutable" error inside the closure.
        let grid = &self.grid;
        let portals = &mut self.portals;
        let cluster_lookup = &mut self.cluster_lookup;

        // Helper to add a portal
        let mut add_portal = |pos: IVec2, c_x: i32, c_y: i32| -> PortalId {
            let id = PortalId(portals.len());
            portals.push(PortalNode {
                id,
                pos,
                cluster_xy: IVec2::new(c_x, c_y),
            });
            let key = format!("{},{}", c_x, c_y);
            cluster_lookup.entry(key).or_default().push(id);
            id
        };

        // Vertical Edges
        for cx in 0..clusters_w - 1 {
            for cy in 0..clusters_h {
                // The x coordinate of the boundary line
                let border_x = (cx + 1) * self.cluster_size - 1;
                // Scan the vertical line segment of this cluster
                let y_start = cy * self.cluster_size;
                let y_end = (y_start + self.cluster_size).min(grid.height);

                Self::scan_boundary(
                    grid,
                    IVec2::new(border_x, y_start), 
                    IVec2::new(0, 1), 
                    y_end - y_start, 
                    IVec2::new(1, 0), // Look right for neighbor
                    cx, cy, 
                    cx + 1, cy,
                    &mut add_portal
                );
            }
        }

        // Horizontal Edges
        for cx in 0..clusters_w {
            for cy in 0..clusters_h - 1 {
                let border_y = (cy + 1) * self.cluster_size - 1;
                let x_start = cx * self.cluster_size;
                let x_end = (x_start + self.cluster_size).min(grid.width);

                Self::scan_boundary(
                    grid,
                    IVec2::new(x_start, border_y),
                    IVec2::new(1, 0),
                    x_end - x_start,
                    IVec2::new(0, 1), // Look down for neighbor
                    cx, cy,
                    cx, cy + 1,
                    &mut add_portal
                );
            }
        }
    }

    /// Generic function to scan a line and find transition segments.
    /// FIX: This is now an associated function (no `&self`), taking `grid` explicitly.
    #[allow(clippy::too_many_arguments)]
    fn scan_boundary<F>(
        grid: &GridMap,
        start_pos: IVec2,
        step: IVec2,
        length: i32,
        neighbor_dir: IVec2,
        c1_x: i32, c1_y: i32,
        c2_x: i32, c2_y: i32,
        add_portal: &mut F
    ) 
    where F: FnMut(IVec2, i32, i32) -> PortalId 
    {
        let mut current = start_pos;
        let mut segment_start: Option<IVec2> = None;
        let mut segment_len = 0;

        for _ in 0..length {
            let neighbor = current + neighbor_dir;
            
            let walkable = grid.is_walkable(current) && grid.is_walkable(neighbor);

            if walkable {
                if segment_start.is_none() {
                    segment_start = Some(current);
                }
                segment_len += 1;
            } else if let Some(start) = segment_start {
                // Segment ended, place portal(s)
                Self::place_portals_in_segment(start, segment_len, step, neighbor_dir, c1_x, c1_y, c2_x, c2_y, add_portal);
                segment_start = None;
                segment_len = 0;
            }

            current += step;
        }

        // Check if segment ended at the very limit
        if let Some(start) = segment_start {
            Self::place_portals_in_segment(start, segment_len, step, neighbor_dir, c1_x, c1_y, c2_x, c2_y, add_portal);
        }
    }

    /// FIX: Associated function, no `&self`.
    #[allow(clippy::too_many_arguments)]
    fn place_portals_in_segment<F>(
        start: IVec2,
        len: i32,
        step: IVec2,
        neighbor_dir: IVec2,
        c1_x: i32, c1_y: i32,
        c2_x: i32, c2_y: i32,
        add_portal: &mut F
    ) where F: FnMut(IVec2, i32, i32) -> PortalId {
        // HPA* optimization: if segment is large, place two portals (ends). If small, one (middle).
        let targets = if len > 5 {
            vec![start, start + step * (len - 1)]
        } else {
            vec![start + step * (len / 2)]
        };

        for p_loc in targets {
            // Create portal on current side
            let _p1 = add_portal(p_loc, c1_x, c1_y);
            // Create portal on neighbor side
            let _p2 = add_portal(p_loc + neighbor_dir, c2_x, c2_y);
        }
    }

    fn build_inter_cluster_edges(&mut self) {
        // Simple logic: if two portals are distance 1 apart and in different clusters, link them.
        let mut pos_map: HashMap<IVec2, PortalId> = HashMap::new();
        for p in &self.portals {
            pos_map.insert(p.pos, p.id);
        }

        for p in &self.portals {
            let neighbors = [IVec2::new(1,0), IVec2::new(-1,0), IVec2::new(0,1), IVec2::new(0,-1)];
            for dir in neighbors {
                let target_pos = p.pos + dir;
                if let Some(&neighbor_id) = pos_map.get(&target_pos) {
                    let neighbor_node = &self.portals[neighbor_id.0];
                    if neighbor_node.cluster_xy != p.cluster_xy {
                        self.graph[p.id.0].push(AbstractEdge {
                            to: neighbor_id,
                            cost: 1, // Adjacent cost
                            is_inter_cluster: true,
                            cached_path: None, // Trivial path
                        });
                    }
                }
            }
        }
    }

    fn build_intra_cluster_edges(&mut self) {
        // For each cluster, find all portals.
        // Compute path between every pair of portals in that cluster.
        for (key, portal_ids) in &self.cluster_lookup {
            if portal_ids.len() < 2 { continue; }

            // Get cluster bounds based on key (x,y)
            let parts: Vec<&str> = key.split(',').collect();
            let cx: i32 = parts[0].parse().unwrap();
            let cy: i32 = parts[1].parse().unwrap();
            
            let min_bound = IVec2::new(cx * self.cluster_size, cy * self.cluster_size);
            let max_bound = IVec2::new(
                ((cx + 1) * self.cluster_size).min(self.grid.width),
                ((cy + 1) * self.cluster_size).min(self.grid.height),
            );

            for i in 0..portal_ids.len() {
                for j in (i+1)..portal_ids.len() {
                    let id_a = portal_ids[i];
                    let id_b = portal_ids[j];
                    let pos_a = self.portals[id_a.0].pos;
                    let pos_b = self.portals[id_b.0].pos;

                    // Run Local A*
                    if let Some((cost, path)) = a_star_local(&self.grid, pos_a, pos_b, min_bound, max_bound) {
                        // Add edge A -> B
                        self.graph[id_a.0].push(AbstractEdge {
                            to: id_b,
                            cost,
                            is_inter_cluster: false,
                            cached_path: Some(path.clone()),
                        });
                        // Add edge B -> A
                         let mut rev_path = path;
                        rev_path.reverse();
                        self.graph[id_b.0].push(AbstractEdge {
                            to: id_a,
                            cost,
                            is_inter_cluster: false,
                            cached_path: Some(rev_path),
                        });
                    }
                }
            }
        }
    }

    // ========================================================================
    // Runtime Pathfinding
    // ========================================================================

    pub fn find_path(&self, start: IVec2, end: IVec2) -> Option<Vec<IVec2>> {
        if !self.grid.is_walkable(start) || !self.grid.is_walkable(end) {
            return None;
        }

        let start_c = IVec2::new(start.x / self.cluster_size, start.y / self.cluster_size);
        let end_c = IVec2::new(end.x / self.cluster_size, end.y / self.cluster_size);

        // Case 1: Same cluster. Just run local A*.
        if start_c == end_c {
             let bounds_min = start_c * self.cluster_size;
             let bounds_max = bounds_min + self.cluster_size;
             return a_star_local(&self.grid, start, end, bounds_min, bounds_max).map(|x| x.1);
        }

        // Case 2: Different clusters. Hierarchical search.
        
        // 1. Connect Start to Portals in Start Cluster
        let start_key = format!("{},{}", start_c.x, start_c.y);
        let start_portals = self.cluster_lookup.get(&start_key).unwrap_or(&Vec::new()).clone();
        
        let mut start_edges: Vec<(PortalId, u32, Vec<IVec2>)> = Vec::new();
        
        {
             let b_min = start_c * self.cluster_size;
             let b_max = b_min + self.cluster_size;
             for &p_id in &start_portals {
                 let p_pos = self.portals[p_id.0].pos;
                 if let Some((cost, path)) = a_star_local(&self.grid, start, p_pos, b_min, b_max) {
                     start_edges.push((p_id, cost, path));
                 }
             }
        }

        if start_edges.is_empty() { return None; } // Trapped in start cluster

        // 2. Connect Portals in End Cluster to End
        let end_key = format!("{},{}", end_c.x, end_c.y);
        let end_portals = self.cluster_lookup.get(&end_key).unwrap_or(&Vec::new()).clone();
        
        let mut end_costs: HashMap<PortalId, (u32, Vec<IVec2>)> = HashMap::new();
        {
             let b_min = end_c * self.cluster_size;
             let b_max = b_min + self.cluster_size;
             for &p_id in &end_portals {
                 let p_pos = self.portals[p_id.0].pos;
                 // Note: Calculate FROM portal TO end
                 if let Some((cost, path)) = a_star_local(&self.grid, p_pos, end, b_min, b_max) {
                     end_costs.insert(p_id, (cost, path));
                 }
             }
        }
        
        if end_costs.is_empty() { return None; } // End is unreachable from its own cluster borders

        // 3. Run Abstract A*
        // Nodes are PortalIds. 
        // Start Set: start_edges.
        // Goal: Any node in end_costs.
        
        let mut dists: HashMap<PortalId, u32> = HashMap::new();
        let mut came_from: HashMap<PortalId, (PortalId, Vec<IVec2>)> = HashMap::new(); // (Parent, PathSegment)
        let mut pq = BinaryHeap::new();

        // Initialize queue with Start->Portal connections
        for (p_id, cost, _path) in &start_edges {
            dists.insert(*p_id, *cost);
            pq.push(State { cost: *cost, position: *p_id, heuristic_cost: *cost + heuristic(self.portals[p_id.0].pos, end) });
        }

        // Store the initial path from start to the first portal separately
        let mut start_connections: HashMap<PortalId, Vec<IVec2>> = HashMap::new();
        for (p_id, _, path) in &start_edges {
             start_connections.insert(*p_id, path.clone());
        }

        let mut final_portal: Option<PortalId> = None;

        while let Some(State { cost, position, .. }) = pq.pop() {
            // Check if we found a connection to the end
            if let Some((to_end_cost, _)) = end_costs.get(&position) {
                let _total = cost + to_end_cost;
                final_portal = Some(position);
                break; 
            }

            if let Some(&d) = dists.get(&position) {
                if cost > d { continue; }
            }

            // Expand abstract neighbors
            if let Some(edges) = self.graph.get(position.0) {
                for edge in edges {
                    let new_cost = cost + edge.cost;
                    
                    if new_cost < *dists.get(&edge.to).unwrap_or(&u32::MAX) {
                        dists.insert(edge.to, new_cost);
                        let h = new_cost + heuristic(self.portals[edge.to.0].pos, end);
                        pq.push(State { cost: new_cost, position: edge.to, heuristic_cost: h });
                        
                        // If cached path exists, use it. If inter-cluster, it's just 1 step.
                        let segment = if edge.is_inter_cluster {
                            vec![self.portals[position.0].pos, self.portals[edge.to.0].pos]
                        } else {
                            edge.cached_path.clone().unwrap_or_default()
                        };
                        came_from.insert(edge.to, (position, segment));
                    }
                }
            }
        }

        // 4. Reconstruct Path
        if let Some(last_p) = final_portal {
            let mut full_path = Vec::new();
            
            // A. End part
            let (_, end_segment) = end_costs.get(&last_p).unwrap();
            
            // B. Abstract Graph part
            let mut curr = last_p;
            
            let mut backward_segments: Vec<Vec<IVec2>> = Vec::new();
            backward_segments.push(end_segment.clone()); // P_last -> End

            while let Some((parent, segment)) = came_from.get(&curr) {
                backward_segments.push(segment.clone());
                curr = *parent;
            }

            // C. Start part
            // curr is now the first portal in the chain
            if let Some(start_segment) = start_connections.get(&curr) {
                 backward_segments.push(start_segment.clone());
            } else {
                return None; 
            }
            
            // backward_segments contains [P_last->End, P_prev->P_last, ..., Start->P_first]
            for segment in backward_segments.iter().rev() {
                // Avoid duplicating points where segments join
                if !full_path.is_empty() && !segment.is_empty() {
                    if *full_path.last().unwrap() == segment[0] {
                        full_path.extend_from_slice(&segment[1..]);
                    } else {
                        full_path.extend_from_slice(segment);
                    }
                } else {
                    full_path.extend_from_slice(segment);
                }
            }
            
            return Some(full_path);
        }

        None
    }
}

// ============================================================================
// Helpers
// ============================================================================

/// Internal State struct used for the abstract graph search priority queue.
/// Note: The local search uses the generic `astar` helper which manages its own state.
#[derive(Copy, Clone, Eq, PartialEq)]
struct State {
    cost: u32,
    position: PortalId,
    heuristic_cost: u32,
}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse for Min-Heap
        other.heuristic_cost.cmp(&self.heuristic_cost)
            .then_with(|| self.cost.cmp(&other.cost))
    }
}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn heuristic(a: IVec2, b: IVec2) -> u32 {
    ((a.x - b.x).abs() + (a.y - b.y).abs()) as u32
}

/// Standard A* limited to a bounding box (for intra-cluster search).
/// Uses the generic implementation from `crate::pathfinding::astar`.
fn a_star_local(grid: &GridMap, start: IVec2, end: IVec2, min: IVec2, max: IVec2) -> Option<(u32, Vec<IVec2>)> {
    
    // Define neighbors closure
    let get_neighbors = |pos: IVec2| -> Vec<(IVec2, u32)> {
        let mut neighbors = Vec::with_capacity(4);
        // Directions: Up, Down, Right, Left
        for dir in [IVec2::new(0, 1), IVec2::new(0, -1), IVec2::new(1, 0), IVec2::new(-1, 0)] {
            let next = pos + dir;
            
            // Check Bounds
            if next.x >= min.x && next.x < max.x && next.y >= min.y && next.y < max.y {
                if grid.is_walkable(next) {
                    neighbors.push((next, 1));
                }
            }
        }
        neighbors
    };

    // Define heuristic closure
    let get_heuristic = |pos: IVec2| -> u32 {
        heuristic(pos, end)
    };

    // Define goal check closure
    let is_goal = |pos: IVec2| -> bool {
        pos == end
    };

    // Execute generic A*
    astar::a_star(start, get_neighbors, get_heuristic, is_goal)
}