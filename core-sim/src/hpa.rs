use glam::DVec2;
use std::collections::HashMap;

// A Cluster is a chunk of the map (e.g., 10x10)
pub struct Cluster {
    pub id: usize,
    pub x: usize,
    pub y: usize,
    pub portals: Vec<DVec2>, // Entrances/Exits
}

pub struct HPAGrid {
    pub width: usize,
    pub height: usize,
    pub cluster_size: usize,
    pub clusters: HashMap<(usize, usize), Cluster>,
    pub abstract_graph: HashMap<usize, Vec<usize>>, // Connections between clusters
}

impl HPAGrid {
    pub fn new(width: usize, height: usize, cluster_size: usize) -> Self {
        Self {
            width,
            height,
            cluster_size,
            clusters: HashMap::new(),
            abstract_graph: HashMap::new(),
        }
    }

    pub fn build_clusters(&mut self) {
        // Divide map into chunks
        let cols = (self.width + self.cluster_size - 1) / self.cluster_size;
        let rows = (self.height + self.cluster_size - 1) / self.cluster_size;

        let mut id_counter = 0;
        for y in 0..rows {
            for x in 0..cols {
                self.clusters.insert((x, y), Cluster {
                    id: id_counter,
                    x,
                    y,
                    portals: Vec::new(),
                });
                id_counter += 1;
            }
        }
        // In a real implementation: Scan edges of clusters to find walkable transitions (Portals)
        // and link them in the abstract_graph.
    }

    pub fn find_path(&self, start: DVec2, end: DVec2) -> Vec<DVec2> {
        // 1. Find Start Cluster and End Cluster
        // 2. A* on the Abstract Graph (Cluster to Cluster)
        // 3. Refine path: A* inside each Cluster between portals
        vec![start, end] // Placeholder for demo
    }
}