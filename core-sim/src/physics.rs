use glam::DVec2;

#[derive(Clone, Copy)]
pub struct Agent {
    pub id: u32,
    pub position: DVec2,
    pub velocity: DVec2,
    pub radius: f64,
    pub max_speed: f64,
    pub pref_velocity: DVec2, // The velocity the pathfinder WANTS
}

pub struct RvoManager {
    pub agents: Vec<Agent>,
}

impl RvoManager {
    pub fn new() -> Self {
        Self { agents: Vec::new() }
    }

    pub fn add_agent(&mut self, agent: Agent) {
        self.agents.push(agent);
    }

    pub fn update_agent_state(&mut self, id: u32, pos: DVec2, pref_vel: DVec2) {
        if let Some(agent) = self.agents.iter_mut().find(|a| a.id == id) {
            agent.position = pos;
            agent.pref_velocity = pref_vel;
        }
    }

    /// Calculates the optimal velocity for an agent avoiding neighbors
    /// Uses a simplified RVO logic (Velocity Obstacles)
    pub fn compute_new_velocity(&self, agent_idx: usize) -> DVec2 {
        let agent = self.agents[agent_idx];
        let mut new_vel = agent.pref_velocity;

        // In a real engine, use a QuadTree here. For <500 units, O(N^2) is acceptable in Wasm.
        for (i, other) in self.agents.iter().enumerate() {
            if i == agent_idx { continue; }

            let dist_sq = agent.position.distance_squared(other.position);
            let combined_radius = agent.radius + other.radius;
            
            // Optimization: Ignore far agents
            if dist_sq > (combined_radius * 2.0).powi(2) { continue; }

            let rel_pos = other.position - agent.position;
            let rel_vel = agent.velocity - other.velocity;
            let dist = dist_sq.sqrt();
            
            // Simple Repulsion / Velocity Obstacle Logic
            // If we are going to collide...
            if dist < combined_radius {
                // Already colliding: strong separation force
                let push = rel_pos.normalize_or_zero() * -1.0;
                new_vel += push * agent.max_speed;
            } else {
                // Future collision check (Time to collision)
                // Project relative velocity onto relative position
                let proj = rel_vel.dot(rel_pos) / dist_sq;
                
                // If moving towards each other
                if proj > 0.0 {
                    // Calculate "Time to Interaction"
                    // Determine if the velocity vector falls inside the "Velocity Obstacle" cone
                    // Simplified: Steer perpendicular to the collision vector
                    let tangent = DVec2::new(-rel_pos.y, rel_pos.x).normalize();
                    
                    // Choose the side that is closer to current velocity
                    let steer_dir = if new_vel.dot(tangent) > 0.0 { tangent } else { -tangent };
                    
                    // Nudge velocity
                    let avoidance_strength = 2.0 * (1.0 - (dist / (combined_radius * 3.0)));
                    new_vel += steer_dir * avoidance_strength;
                }
            }
        }

        // Clamp to max speed
        if new_vel.length_squared() > agent.max_speed * agent.max_speed {
            new_vel = new_vel.normalize() * agent.max_speed;
        }

        new_vel
    }
}