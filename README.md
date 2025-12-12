# Readable Engine

> **A deterministic Web/Wasm RTS engine optimized for "Vibe Coding" (LLM Co-Creation).**

Readable Engine is an experimental Real-Time Strategy (RTS) framework designed to bridge the gap between high-performance deterministic simulation (Rust/Wasm) and high-context semantic readability (TypeScript/JSON).

It is built specifically to be "piloted" by Large Language Models. API surfaces are verbose, data is strictly typed via schemas, and architecture favors composition over inheritance, allowing LLMs to write game logic without hallucinating complex state management.

---

## 🏗 Architecture

The engine follows the **Deterministic Lockstep** model used in games like *StarCraft* and *Age of Empires*.

### 1. The Core (`/core-sim`) - Rust 🦀
The "Black Box" of the engine. It handles the heavy lifting where binary determinism is required.
*   **Compiles to:** WebAssembly (Wasm).
*   **Responsibilities:**
    *   Fixed-Point Math (via `glam` f64).
    *   Pathfinding (Flow Fields, NavMesh + Funnel, HPA*).
    *   Physics & Collision (RVO - Reciprocal Velocity Obstacles).
    *   State Management (The "Truth" of the simulation).

### 2. The Shell (`/engine-ts`) - TypeScript 📘
The "Glue" that connects the simulation to the browser.
*   **Responsibilities:**
    *   **Game Loop:** Accumulator-based fixed timestep loop (15-20 TPS).
    *   **Rendering:** Three.js (Interpolated state for smooth 60fps visuals).
    *   **Networking:** "Virtual Server" pattern (Abstracted Transport for Geckos.io/PeerJS).
    *   **Input:** Spatial Partitioning (Quadtree) for unit selection.

### 3. The Data (`/game-data`) - JSON 📄
The "Interface" for the LLM.
*   **Philosophy:** If it's not in a JSON file, it doesn't exist.
*   **Usage:** Units, Levels, and Tech Trees are defined here in strict schemas.

---

## 🚀 Current Status: Phase 2 (Simulation Core)

We have successfully implemented the **Deterministic Core**.

### Implemented Algorithms:
1.  **RVO (Reciprocal Velocity Obstacles):**
    *   Local collision avoidance. Units nudge each other out of the way smoothly without overlapping.
    *   *Status:* Basic implementation active.
2.  **Flow Fields (Vector Fields):**
    *   Optimized for swarms (100+ units).
    *   Calculates a map of directions once; units simply "flow" downhill.
    *   *Status:* Dijkstra integration field implemented.
3.  **NavMesh + Funnel Algorithm:**
    *   Optimized for complex geometry.
    *   Uses A* on a mesh of triangles, followed by String Pulling (Funnel) to smooth paths.
    *   *Status:* Triangle graph logic and barycentric checks active.
4.  **HPA\* (Hierarchical Pathfinding A\*):**
    *   Optimized for long-distance grid movement.
    *   Divides map into clusters to speed up calculation.
    *   *Status:* Cluster segmentation structure active.

---

## 🛠 Setup & Run

### Prerequisites
*   **Node.js** (v18+)
*   **Rust** (latest stable)
*   **wasm-pack** (`cargo install wasm-pack`)

### 1. Build the Wasm Core
```bash
cd core-sim
npx wasm-pack build --target web
```

### 2. Run the Engine
```bash
cd engine-ts
npm install
npm run dev
```

Open `http://localhost:3000` to see the simulation.

---

## 🤖 Vibe Coding Guide (How to prompt this engine)

When working with an LLM to build games on this engine, follow these rules:

### 1. The "Manifest" Protocol
Always provide the API Manifest (generated in `/generated/manifest.txt`) in your system prompt. This tells the LLM available ECS components and Events.

### 2. Data-First Logic
Don't ask the LLM to "write a class for a Tank."
**Ask:** "Create a JSON definition for a Tank with high armor and slow movement."
*The engine handles the logic; the LLM handles the data.*

### 3. Simulation vs. Visualization
Remind the LLM:
*   **Simulation (Rust):** Happens at 15 ticks/sec. Discrete. Integer/Fixed-point.
*   **Visualization (JS):** Happens at 60 frames/sec. Interpolated.
*   *Rule:* Never put game logic in the `requestAnimationFrame` loop.

---

## 🗺 Roadmap

- [x] **Phase 1:** Project Skeleton & Tooling.
- [x] **Phase 2:** Deterministic Core (RVO, Pathfinding).
- [ ] **Phase 3:** ECS & State Hydration (bitECS integration).
- [ ] **Phase 4:** Networking (Lockstep Protocol).
- [ ] **Phase 5:** Rendering (Three.js InstancedMesh).
- [ ] **Phase 6:** "Headless" Auto-Balancer.
