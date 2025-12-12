mod math;
mod pathfinding;
mod physics;

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use glam::DVec2;
use crate::pathfinding::flow::FlowField;
use crate::pathfinding::navmesh::{NavMesh, Triangle};
use crate::physics::{RvoManager, Agent};

#[wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    Ok(())
}

#[derive(Deserialize)]
pub struct InputCommand {
    pub id: u32,
    pub action: String, // "MOVE", "STOP"
    pub target_x: f64,
    pub target_y: f64,
    pub mode: Option<String>, // "FLOW", "NAV", "DIRECT"
}

#[derive(Serialize, Clone)]
pub struct EntityState {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vel_x: f64,
    pub vel_y: f64,
}

#[wasm_bindgen]
pub struct Simulation {
    tick_count: u64,
    entities: Vec<EntityState>,
    
    // Systems
    flow_field: FlowField,
    nav_mesh: NavMesh,
    rvo: RvoManager,
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Simulation {
        let mut sim = Simulation {
            tick_count: 0,
            entities: Vec::new(),
            flow_field: FlowField::new(100, 100),
            nav_mesh: NavMesh::new(),
            rvo: RvoManager::new(),
        };

        // Initialize a dummy NavMesh (2 triangles forming a square)
        sim.nav_mesh.triangles.push(Triangle {
            id: 0,
            vertices: [DVec2::new(0.0,0.0), DVec2::new(50.0,0.0), DVec2::new(0.0,50.0)],
            neighbors: [Some(1), None, None],
        });
        sim.nav_mesh.triangles.push(Triangle {
            id: 1,
            vertices: [DVec2::new(50.0,0.0), DVec2::new(50.0,50.0), DVec2::new(0.0,50.0)],
            neighbors: [None, None, Some(0)],
        });

        sim
    }

    pub fn add_entity(&mut self, id: u32, x: f64, y: f64) {
        self.entities.push(EntityState { id, x, y, vel_x: 0.0, vel_y: 0.0 });
        self.rvo.add_agent(Agent {
            id,
            position: DVec2::new(x, y),
            velocity: DVec2::ZERO,
            radius: 0.5, // Unit radius
            max_speed: 0.5,
            pref_velocity: DVec2::ZERO,
        });
    }

    pub fn tick(&mut self, input_json: String) {
        self.tick_count += 1;

        // 1. Process Inputs
        let inputs: Vec<InputCommand> = serde_json::from_str(&input_json).unwrap_or_default();
        
        // Global target update (for FlowField demo)
        for input in inputs {
            if input.action == "MOVE" {
                // If mode is FLOW, update the global field
                if input.mode.as_deref() == Some("FLOW") {
                    self.flow_field.generate_target(input.target_x, input.target_y);
                }
                // For individual units, we set their preferred velocity below
            }
        }

        // 2. Calculate Preferred Velocities (Pathfinding Layer)
        for i in 0..self.rvo.agents.len() {
            let agent_pos = self.rvo.agents[i].position;
            
            // Strategy: Look up flow field direction
            // In a real engine, we would check the Entity's specific pathing component
            let flow_dir = self.flow_field.get_direction(agent_pos.x, agent_pos.y);
            
            // Set preferred velocity based on Flow Field
            let speed = 0.5;
            self.rvo.agents[i].pref_velocity = flow_dir * speed;
        }

        // 3. Resolve Collisions (RVO Layer)
        let mut new_velocities = Vec::new();
        for i in 0..self.rvo.agents.len() {
            let v = self.rvo.compute_new_velocity(i);
            new_velocities.push(v);
        }

        // 4. Apply Physics & Update State
        for (i, entity) in self.entities.iter_mut().enumerate() {
            let vel = new_velocities[i];
            
            // Update RVO agent
            self.rvo.agents[i].velocity = vel;
            self.rvo.agents[i].position += vel;

            // Sync to EntityState (for rendering)
            entity.x = self.rvo.agents[i].position.x;
            entity.y = self.rvo.agents[i].position.y;
            entity.vel_x = vel.x;
            entity.vel_y = vel.y;
        }
    }

    pub fn get_state(&self) -> String {
        serde_json::to_string(&self.entities).unwrap()
    }
}