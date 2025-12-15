mod math;
mod pathfinding;
mod physics;

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use glam::DVec2;
use std::collections::HashMap;
use crate::pathfinding::flow::FlowField;
use crate::pathfinding::navmesh::{NavMesh, Triangle};
use crate::physics::{RvoManager, Agent};

// --- SNAPSHOT STRUCT ---
// This represents the entire "Save State" of the simulation.
// We derive Serialize/Deserialize to allow passing it to JS as a JSON-like object.
#[derive(Serialize, Deserialize)]
pub struct SimSnapshot {
    pub tick_count: u64,
    pub rvo: RvoManager,
    pub flow_field: FlowField,
    // NavMesh is included in case we add dynamic terrain modification later.
    pub nav_mesh: NavMesh, 
}

// --- MAIN SIMULATION STRUCT ---
#[wasm_bindgen]
pub struct Simulation {
    tick_count: u64,
    
    // We keep a parallel vector of raw data for fast export to JS
    // Layout: [id, x, y, vel_x, vel_y, ...repeat...]
    export_buffer: Vec<f64>, 
    
    // Systems
    flow_field: FlowField,
    nav_mesh: NavMesh,
    rvo: RvoManager,
}

// Helper struct for parsing JSON commands from JS
#[derive(Deserialize)]
pub struct InputCommand {
    pub id: u32,
    pub action: String,
    pub target_x: f64,
    pub target_y: f64,
    pub mode: Option<String>,
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Simulation {
        // Panic hook for better error logging in browser console
        console_error_panic_hook::set_once();

        Simulation {
            tick_count: 0,
            export_buffer: Vec::new(),
            flow_field: FlowField::new(100, 100),
            nav_mesh: NavMesh::new(),
            rvo: RvoManager::new(),
        }
    }

    // JS provides the ID now (from bitECS)
    pub fn add_agent(&mut self, id: u32, x: f64, y: f64, radius: f64, max_speed: f64) {
        self.rvo.add_agent(Agent {
            id,
            position: DVec2::new(x, y),
            velocity: DVec2::ZERO,
            radius,
            max_speed,
            pref_velocity: DVec2::ZERO,
        });
    }

    // The Main Deterministic Loop
    pub fn tick(&mut self, input_json: String) {
        self.tick_count += 1;

        // 1. Process Inputs
        // We parse the JSON string sent from JS. 
        // In a real network scenario, this JSON comes from the server "Tick Bundle".
        let inputs: Vec<InputCommand> = serde_json::from_str(&input_json).unwrap_or_default();
        
        for input in inputs {
            if input.action == "MOVE" {
                if input.mode.as_deref() == Some("FLOW") {
                    // Update the global flow field (Dijkstra)
                    self.flow_field.generate_target(input.target_x, input.target_y);
                } else {
                    // Direct unit command (fallback)
                    self.rvo.update_agent_state(
                        input.id, 
                        DVec2::new(input.target_x, input.target_y), // Temporary pos hack
                        DVec2::ZERO // Reset velocity
                    );
                }
            }
        }

        // 2. Pathfinding (Flow Field Integration)
        // Every agent looks at the flow field tile underneath them to get their desired direction.
        for i in 0..self.rvo.agents.len() {
            let agent_pos = self.rvo.agents[i].position;
            let flow_dir = self.flow_field.get_direction(agent_pos.x, agent_pos.y);
            
            // Set the "Preferred Velocity" for the physics engine
            self.rvo.agents[i].pref_velocity = flow_dir * self.rvo.agents[i].max_speed;
        }

        // 3. Physics (RVO / Collision Avoidance)
        // We calculate new velocities based on neighbors to avoid overlapping.
        let mut new_velocities = Vec::new();
        for i in 0..self.rvo.agents.len() {
            new_velocities.push(self.rvo.compute_new_velocity(i));
        }

        // 4. Update State
        for (i, vel) in new_velocities.into_iter().enumerate() {
            let agent = &mut self.rvo.agents[i];
            agent.velocity = vel;
            agent.position += vel;
        }

        // 5. Populate Export Buffer
        self.rebuild_export_buffer();
    }

    // --- SNAPSHOTS (PHASE 3) ---

    /// Serializes the entire simulation state into a JS Object.
    /// This uses `serde-wasm-bindgen` to convert Rust structs -> JS Objects.
    pub fn get_snapshot(&self) -> JsValue {
        let snap = SimSnapshot {
            tick_count: self.tick_count,
            rvo: self.rvo.clone(),             // Requires #[derive(Clone)] on RvoManager
            flow_field: self.flow_field.clone(), // Requires #[derive(Clone)] on FlowField
            nav_mesh: self.nav_mesh.clone(),     // Requires #[derive(Clone)] on NavMesh
        };
        serde_wasm_bindgen::to_value(&snap).unwrap()
    }

    /// Restores the simulation state from a JS Object.
    pub fn load_snapshot(&mut self, val: JsValue) {
        let snap: SimSnapshot = serde_wasm_bindgen::from_value(val).unwrap();
        
        self.tick_count = snap.tick_count;
        self.rvo = snap.rvo;
        self.flow_field = snap.flow_field;
        self.nav_mesh = snap.nav_mesh;

        // CRITICAL: Rebuild the export buffer immediately.
        // If we don't do this, the JS renderer will read an empty buffer 
        // for one frame, causing all units to flicker/disappear.
        self.rebuild_export_buffer();
    }

    // --- ID REMAPPING (PHASE 3 FIX) ---

    /// Updates Agent IDs to match a new set of IDs provided by JS.
    /// This is required after loading a snapshot, as bitECS will assign new internal IDs.
    pub fn remap_ids(&mut self, old_ids: &[u32], new_ids: &[u32]) {
        if old_ids.len() != new_ids.len() {
            // In production, you might want to log an error or return a Result
            return;
        }

        // Build a lookup map: Old ID -> New ID
        let mut map = HashMap::new();
        for (i, &old_id) in old_ids.iter().enumerate() {
            map.insert(old_id, new_ids[i]);
        }

        // Apply to all agents
        for agent in &mut self.rvo.agents {
            if let Some(&new_id) = map.get(&agent.id) {
                agent.id = new_id;
            }
        }

        // Rebuild buffer so the very next render call uses the correct new IDs
        self.rebuild_export_buffer();
    }

    // --- ZERO-COPY MEMORY INTEROP ---

    /// Returns a pointer to the start of the Float64Array in Wasm memory.
    pub fn get_state_ptr(&self) -> *const f64 {
        self.export_buffer.as_ptr()
    }

    /// Returns the length (element count) of the buffer.
    pub fn get_state_len(&self) -> usize {
        self.export_buffer.len()
    }

    // --- INTERNAL HELPERS ---

    fn rebuild_export_buffer(&mut self) {
        self.export_buffer.clear();
        
        // Ensure capacity to prevent frequent reallocations
        // 5 floats per agent: [id, x, y, vx, vy]
        self.export_buffer.reserve(self.rvo.agents.len() * 5);

        for agent in &self.rvo.agents {
            self.export_buffer.push(agent.id as f64);
            self.export_buffer.push(agent.position.x);
            self.export_buffer.push(agent.position.y);
            self.export_buffer.push(agent.velocity.x);
            self.export_buffer.push(agent.velocity.y);
        }
    }
}