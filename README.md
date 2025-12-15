# Readable Engine

> **A deterministic Web/Wasm RTS engine optimized for "Vibe Coding" (LLM Co-Creation).**

Readable Engine is an experimental Real-Time Strategy (RTS) framework designed to bridge the gap between high-performance deterministic simulation (Rust/Wasm) and high-context semantic readability (TypeScript/JSON).

It is built specifically to be "piloted" by Large Language Models. API surfaces are verbose, data is strictly typed via schemas, and architecture favors composition over inheritance.

---

## 🏗 Architecture

The engine follows the **Deterministic Lockstep** model used in games like *StarCraft* and *Age of Empires*, with a dedicated layer for automated testing and LLM interaction.

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
*   **Game Loop:** Accumulator-based fixed timestep loop (15 TPS).
*   **Rendering:** Three.js (Interpolated state for smooth 60fps visuals).

### 3. The Network (`/engine-ts/network`) - Virtual Server 🌐
The engine uses a **Virtual Server Pattern** to decouple game logic from transport.
*   **Lockstep Manager:** Buffers inputs and pauses the simulation if the "Tick Bundle" for the current turn hasn't arrived.
*   **Adapters:**
    *   `LocalAdapter`: Single-player loopback (66ms tick).
    *   `GeckosAdapter`: UDP-like WebRTC for multiplayer.
    *   `HeadlessAdapter`: Synchronous adapter for high-speed automated testing.

### 4. Vibe Tools (QA & Automation) 🤖
Tools designed specifically for LLM context and automated verification.
*   **ErrorReporter:** Captures game state snapshots (JSON) when a crash occurs, allowing LLMs to debug via text logs.
*   **ASCIIMapParser:** Allows defining levels using simple text grids.
*   **HeadlessRunner:** Runs the simulation at max speed without rendering to verify game balance.

---

## 🚀 Current Status: Phase 6 (Vibe Features)

We have preliminary implemented the entire Vibe Coding toolset.

### ✅ Preliminary Implemented Features:
*   **Virtual Server:** `LocalAdapter` simulates server authority and latency for robust single-player testing.
*   **Lockstep Protocol:** Deterministic input execution with "Playout Delay" to mask network jitter.
*   **RVO & Flow Fields:** Deterministic pathfinding in Rust.
*   **bitECS Integration:** High-performance SoA (Structure of Arrays) in TypeScript.
*   **Rendering:** Three.js InstancedMesh with alpha interpolation.
*   **Automation:** Headless mode and ASCII level parsing.

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

### Modes
*   **Single Player (Default):** `http://localhost:5173/`
*   **Multiplayer:** `http://localhost:5173/?net` (Requires Geckos.io server)
*   **Headless (QA):** `http://localhost:5173/?headless` (Runs simulation and outputs results to DOM)

---

## 🤖 Vibe Coding Guide (How to prompt this engine)

When working with an LLM to build games on this engine, follow these rules:

### 1. The "Hydrator" Protocol
Do not write classes for units. Write **Data**.
**Prompt:** "Create a JSON definition for a fast Scout Unit."

### 2. The "Manifest"
Provide `engine-ts/src/data/schema.ts` to the LLM. This is its "dictionary" of available components.

### 3. Level Design via ASCII
**Prompt:** "Create a map with a base in the top left and a choke point in the middle."
**LLM Response:**
```typescript
mapParser.parse(`
#####
#B .#
#. #
# . #
#####
`);
```

### 4. Automated Balancing
**Prompt:** "Simulate 50 Zerglings vs 10 Marines. Who wins?"
**LLM Action:** The LLM should generate a script using `HeadlessRunner`, run it with `?headless`, and read the JSON output.

---

## 🗺 Roadmap

- **Phase 1:** Project Skeleton & Tooling.
- **Phase 2:** Deterministic Core (RVO, Pathfinding).
- **Phase 3:** ECS & State Hydration (bitECS + Zod).
- **Phase 4:** Networking (Lockstep Protocol & Input Buffers).
- **Phase 5:** Rendering (Three.js InstancedMesh).
- **Phase 6:** Vibe Features (Headless Runner, ASCII Parser, Error Reporter).
