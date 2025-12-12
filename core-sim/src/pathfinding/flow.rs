use glam::DVec2;
use std::collections::BinaryHeap;
use std::cmp::Ordering;
use serde::{Deserialize, Serialize};

// Helper struct for the Priority Queue (Dijkstra's Algorithm)
#[derive(Copy, Clone, PartialEq)]
struct State {
    cost: f64,
    index: usize,
}

// Rust's BinaryHeap is a max-heap, so we flip the ordering to get a min-heap
impl Eq for State {}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        other.cost.partial_cmp(&self.cost)
    }
}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        self.partial_cmp(other).unwrap()
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FlowField {
    pub width: usize,
    pub height: usize,
    pub costs: Vec<u8>,        // 1 = Walkable, 255 = Wall
    pub integration: Vec<f64>, // Distance to target (Heatmap)
    pub vectors: Vec<DVec2>,   // Final direction vectors for agents
}

impl FlowField {
    pub fn new(width: usize, height: usize) -> Self {
        let size = width * height;
        Self {
            width,
            height,
            costs: vec![1; size],
            integration: vec![f64::MAX; size],
            vectors: vec![DVec2::ZERO; size],
        }
    }

    /// Sets a tile as an obstacle (Wall) or walkable.
    /// 255 is used as the "Impassable" cost.
    pub fn set_obstacle(&mut self, x: usize, y: usize, is_wall: bool) {
        if x < self.width && y < self.height {
            self.costs[y * self.width + x] = if is_wall { 255 } else { 1 };
        }
    }

    /// Generates the Integration Field (Dijkstra) and then the Vector Field.
    /// This is called whenever the target changes or the map changes.
    pub fn generate_target(&mut self, target_x: f64, target_y: f64) {
        let tx = target_x.round() as usize;
        let ty = target_y.round() as usize;

        // Bounds check
        if tx >= self.width || ty >= self.height { 
            return; 
        }

        // 1. Reset Integration Field
        self.integration.fill(f64::MAX);
        
        let target_idx = ty * self.width + tx;
        self.integration[target_idx] = 0.0;

        // 2. Dijkstra's Algorithm
        let mut heap = BinaryHeap::new();
        heap.push(State { cost: 0.0, index: target_idx });

        // 4-way connectivity (Up, Down, Left, Right)
        let neighbors = [(0, 1), (1, 0), (0, -1), (-1, 0)];

        while let Some(State { cost, index }) = heap.pop() {
            // If we found a shorter path already, skip
            if cost > self.integration[index] { continue; }

            let cx = index % self.width;
            let cy = index / self.width;

            for (dx, dy) in neighbors.iter() {
                let nx = (cx as isize + dx) as usize;
                let ny = (cy as isize + dy) as usize;

                if nx < self.width && ny < self.height {
                    let n_idx = ny * self.width + nx;
                    let tile_cost = self.costs[n_idx];
                    
                    // If walkable
                    if tile_cost < 255 {
                        let next_cost = cost + tile_cost as f64;
                        if next_cost < self.integration[n_idx] {
                            self.integration[n_idx] = next_cost;
                            heap.push(State { cost: next_cost, index: n_idx });
                        }
                    }
                }
            }
        }

        // 3. Generate Vector Field based on new integration costs
        self.generate_vectors();
    }

    /// Calculates gradients: Units look at neighbors and move toward the one 
    /// with the lowest integration cost (closest to target).
    fn generate_vectors(&mut self) {
        for y in 0..self.height {
            for x in 0..self.width {
                let idx = y * self.width + x;
                
                // If this tile is a wall, it has no vector
                if self.costs[idx] == 255 { 
                    self.vectors[idx] = DVec2::ZERO;
                    continue; 
                }

                let mut best_cost = self.integration[idx];
                let mut grad = DVec2::ZERO;

                // Check 4 neighbors to find the "downhill" slope
                let neighbors = [
                    (0, -1, DVec2::new(0.0, -1.0)), // Up
                    (1, 0, DVec2::new(1.0, 0.0)),   // Right
                    (0, 1, DVec2::new(0.0, 1.0)),   // Down
                    (-1, 0, DVec2::new(-1.0, 0.0))  // Left
                ];

                for (dx, dy, dir) in neighbors {
                    let nx = (x as isize + dx) as usize;
                    let ny = (y as isize + dy) as usize;

                    if nx < self.width && ny < self.height {
                        let n_idx = ny * self.width + nx;
                        let n_cost = self.integration[n_idx];
                        
                        // If neighbor is closer to target, point that way
                        if n_cost < best_cost {
                            best_cost = n_cost;
                            grad = dir;
                        }
                    }
                }
                
                // Store the result
                self.vectors[idx] = grad;
            }
        }
    }

    /// Helper to sample the flow field at a specific world coordinate.
    pub fn get_direction(&self, x: f64, y: f64) -> DVec2 {
        let ix = x.round() as usize;
        let iy = y.round() as usize;
        
        if ix >= self.width || iy >= self.height { 
            return DVec2::ZERO; 
        }
        
        self.vectors[iy * self.width + ix]
    }
}