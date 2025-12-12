mod math;
mod pathfinding;
mod physics;

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use glam::DVec2;
use crate::pathfinding::flow::FlowField;
use crate::pathfinding::navmesh::{NavMesh, Triangle};
use crate::physics::{RvoManager, Agent};

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
        let mut sim = Simulation {
            tick_count: 0,
            export_buffer: Vec::new(),
            flow_field: FlowField::new(100, 100),
            nav_mesh: NavMesh::new(),
            rvo: RvoManager::new(),
        };
        // Init dummy NavMesh (omitted for brevity, same as before)
        sim
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

    pub fn tick(&mut self, input_json: String) {
        self.tick_count += 1;

        // 1. Process Inputs (Same as before)
        let inputs: Vec<InputCommand> = serde_json::from_str(&input_json).unwrap_or_default();
        for input in inputs {
            if input.action == "MOVE" && input.mode.as_deref() == Some("FLOW") {
                self.flow_field.generate_target(input.target_x, input.target_y);
            }
        }

        // 2. Pathfinding & Physics (Same logic as before)
        for i in 0..self.rvo.agents.len() {
            let agent_pos = self.rvo.agents[i].position;
            let flow_dir = self.flow_field.get_direction(agent_pos.x, agent_pos.y);
            self.rvo.agents[i].pref_velocity = flow_dir * self.rvo.agents[i].max_speed;
        }

        let mut new_velocities = Vec::new();
        for i in 0..self.rvo.agents.len() {
            new_velocities.push(self.rvo.compute_new_velocity(i));
        }

        // 3. Update & Populate Export Buffer
        self.export_buffer.clear();
        
        for (i, vel) in new_velocities.into_iter().enumerate() {
            let agent = &mut self.rvo.agents[i];
            agent.velocity = vel;
            agent.position += vel;

            // Push to buffer: [id, x, y, vx, vy]
            self.export_buffer.push(agent.id as f64);
            self.export_buffer.push(agent.position.x);
            self.export_buffer.push(agent.position.y);
            self.export_buffer.push(agent.velocity.x);
            self.export_buffer.push(agent.velocity.y);
        }
    }

    // --- ZERO-COPY INTEROP ---

    pub fn get_state_ptr(&self) -> *const f64 {
        self.export_buffer.as_ptr()
    }

    pub fn get_state_len(&self) -> usize {
        self.export_buffer.len()
    }
}