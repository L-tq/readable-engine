# Readable Engine

> **A deterministic Web/Wasm RTS engine optimized for "Vibe Coding" (LLM Co-Creation).**

Readable Engine is an experimental Real-Time Strategy (RTS) framework designed to bridge the gap between high-performance deterministic simulation (Rust/Wasm) and high-context semantic readability (TypeScript/JSON).

It is built specifically to be "piloted" by Large Language Models. API surfaces are verbose, data is strictly typed via schemas, and architecture favors composition over inheritance.

---

## 🏗 Architecture

The engine follows the **Deterministic Lockstep** model used in games like *StarCraft* and *Age of Empires*.

### 1. The Core (`/core-sim`) - Rust 🦀
The "Black Box" of the engine. It handles the heavy lifting where binary determinism is required.
*   **Compiles to:** WebAssembly (Wasm).
*   **Responsibilities:**
    *   Fixed-Point Math (via `glam` f64).
    *   **RVO Collision** (Reciprocal Velocity Obstacles).
    *   **Binary State Sync:** Exposes raw memory pointers (`Float64Array`) to JS for zero-copy state updates.

### 2. The Shell (`/engine-ts`) - TypeScript 📘
The "Glue" that connects the simulation to the browser.
*   **ECS (Entity Component System):** Uses **bitECS** for high-performance memory layout.
*   **The Hydrator:** A system that converts human-readable JSON into binary ECS arrays.
*   **Game Loop:** Accumulator-based fixed timestep loop (15-20 TPS).
*   **Rendering:** Three.js (Interpolated state for smooth 60fps visuals).

### 3. The Data (`/game-data`) - JSON 📄
The "Interface" for the LLM.
*   **Zod Schemas:** Strict validation ensures the LLM doesn't "hallucinate" invalid properties.
*   **Usage:** Units are defined purely as data.

---

## 🚀 Current Status: Phase 3 (State & Data)

We have successfully implemented the **ECS & Data Layer**.

### ✅ Implemented Features:
*   **RVO & Flow Fields:** Deterministic pathfinding in Rust.
*   **bitECS Integration:** High-performance SoA (Structure of Arrays) in TypeScript.
*   **The Hydrator:** Spawns entities from JSON definitions.
*   **Binary Sync:** Zero-copy memory transfer from Rust Physics -> TypeScript ECS.
*   **Zod Validation:** Runtime schema checking for entity definitions.

---

## 🛠 Setup & Run

### Prerequisites
1.  **Node.js** (v18+)
2.  **Rust** (latest stable)
3.  **wasm-pack** (Install via: `cargo install wasm-pack`)

### Step 1: Build the Wasm Core
Compile the Rust simulation code into WebAssembly.

```bash
cd core-sim
npx wasm-pack build --target web
```

### Step 2: Install Engine Dependencies
Install TypeScript libraries (bitECS, Three.js, Zod).

```bash
cd ../engine-ts
npm install
```

### Step 3: Run the Simulation
Start the Vite development server.

```bash
npm run dev
```

Open `http://localhost:5173` (or the port shown in terminal) to see the simulation.

---

## 🤖 Vibe Coding Guide (How to prompt this engine)

When working with an LLM to build games on this engine, follow these rules:

### 1. The "Hydrator" Protocol
Do not write classes for units. Write **Data**.
**Prompt:** "Create a JSON definition for a fast Scout Unit."
**Expected Output:**
```json
{
  "name": "Scout",
  "components": {
    "Position": { "x": 0, "y": 0 },
    "Health": { "current": 20, "max": 20 },
    "UnitState": { "state": "IDLE" },
    "Physics": { "radius": 0.3, "max_speed": 1.2 }
  }
}
```

### 2. The "Manifest"
Provide the contents of `engine-ts/src/data/schema.ts` to the LLM. This tells it exactly what Components are available (Health, Velocity, etc.) so it doesn't invent fake ones.

### 3. Simulation vs. Visualization
Remind the LLM:
*   **Simulation (Rust):** Happens at 15 ticks/sec. Discrete. Integer/Fixed-point.
*   **Visualization (JS):** Happens at 60 frames/sec. Interpolated.
*   *Rule:* Never put game logic in the `requestAnimationFrame` loop.

---

## 🗺 Roadmap

- [x] **Phase 1:** Project Skeleton & Tooling.
- [x] **Phase 2:** Deterministic Core (RVO, Pathfinding).
- [x] **Phase 3:** ECS & State Hydration (bitECS + Zod).
- [ ] **Phase 4:** Networking (Lockstep Protocol & Input Buffers).
- [ ] **Phase 5:** Rendering (Three.js InstancedMesh).
- [ ] **Phase 6:** "Headless" Auto-Balancer.