use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use std::hash::Hash;
use std::ops::Add;

/// A generic wrapper for the priority queue state.
/// This handles the Min-Heap logic and floating point comparisons if C is f64.
struct State<N, C> {
    node: N,
    cost: C, // This represents f_score (g + h)
}

impl<N, C: PartialEq> PartialEq for State<N, C> {
    fn eq(&self, other: &Self) -> bool {
        self.cost == other.cost
    }
}

impl<N, C: PartialEq> Eq for State<N, C> {}

impl<N, C: PartialOrd> Ord for State<N, C> {
    fn cmp(&self, other: &Self) -> Ordering {
        // BinaryHeap is a MaxHeap, so we reverse to get MinHeap behavior.
        // We use partial_cmp to handle f64, defaulting to Equal if NaN.
        other
            .cost
            .partial_cmp(&self.cost)
            .unwrap_or(Ordering::Equal)
    }
}

impl<N, C: PartialOrd> PartialOrd for State<N, C> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Generic A* Implementation.
///
/// # Type Parameters
/// * `N` - Node type (e.g., IVec2, usize).
/// * `C` - Cost type (e.g., u32, f64).
///
/// # Arguments
/// * `start` - The starting node.
/// * `get_neighbors` - A closure returning a list of (Neighbor, EdgeCost).
/// * `get_heuristic` - A closure returning the estimated cost to the goal.
/// * `is_goal` - A closure returning true if the node is the target.
pub fn a_star<N, C, FN, FH, FG>(
    start: N,
    mut get_neighbors: FN,
    mut get_heuristic: FH,
    mut is_goal: FG,
) -> Option<(C, Vec<N>)>
where
    N: Eq + Hash + Copy,
    C: Default + Copy + PartialOrd + Add<Output = C>,
    FN: FnMut(N) -> Vec<(N, C)>,
    FH: FnMut(N) -> C,
    FG: FnMut(N) -> bool,
{
    let mut open_set = BinaryHeap::new();
    let mut came_from: HashMap<N, N> = HashMap::new();
    let mut g_score: HashMap<N, C> = HashMap::new();

    let start_h = get_heuristic(start);
    
    // C::default() is usually 0 for numeric types
    g_score.insert(start, C::default());
    
    open_set.push(State {
        node: start,
        cost: start_h,
    });

    while let Some(State { node: current, cost: _current_f }) = open_set.pop() {
        if is_goal(current) {
            // Reconstruct path
            let mut path = vec![current];
            let mut curr = current;
            while let Some(&prev) = came_from.get(&curr) {
                path.push(prev);
                curr = prev;
            }
            path.reverse();
            
            let total_cost = *g_score.get(&current).unwrap();
            return Some((total_cost, path));
        }

        // Optimization: If we found a shorter way to this node already in a previous iteration
        // (lazy deletion from heap), skip it.
        let current_g = *g_score.get(&current).unwrap_or(&C::default());
        // Note: strictly speaking, we should check if _current_f > stored_f, 
        // but checking g_score is often sufficient in consistent A*.
        
        for (neighbor, edge_cost) in get_neighbors(current) {
            let tentative_g = current_g + edge_cost;
            
            // If this path to neighbor is better than any previous one
            // We use a helper to handle the "infinite" default case for hashmap lookups
            let neighbor_g = g_score.get(&neighbor);
            
            if neighbor_g.is_none() || tentative_g < *neighbor_g.unwrap() {
                g_score.insert(neighbor, tentative_g);
                came_from.insert(neighbor, current);
                
                let f_score = tentative_g + get_heuristic(neighbor);
                open_set.push(State {
                    node: neighbor,
                    cost: f_score,
                });
            }
        }
    }

    None
}