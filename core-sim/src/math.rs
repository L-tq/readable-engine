use glam::DVec2;
use serde::{Deserialize, Serialize};

// We use DVec2 (Double precision) because JS numbers are f64.
// This minimizes conversion errors between TS and Rust.
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct SimVector {
    pub x: f64,
    pub y: f64,
}

impl SimVector {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn to_glam(self) -> DVec2 {
        DVec2::new(self.x, self.y)
    }

    pub fn from_glam(v: DVec2) -> Self {
        Self { x: v.x, y: v.y }
    }
}