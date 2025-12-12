# Readable Engine

A deterministic Web/Wasm RTS engine optimized for LLM co-creation ("Vibe Coding").

## Directory Structure

- `core-sim/` - Rust/Wasm simulation core (Physics, Collision, Math).
- `engine-ts/` - TypeScript game engine (ECS, Renderer, network glue).
- `game-data/` - JSON/YAML data definitions for Units, Levels, Rules.
- `generated/` - Auto-generated context files (Manifests, Schemas).

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- Rust & Cargo (latest stable)

### Windows & Linux Setup

1.  **Install dependencies**:
    ```bash
    cd engine-ts
    npm install
    ```

2.  **Build Simulation Core**:
    ```bash
    cd core-sim
    # Ensure wasm32 target is installed: rustup target add wasm32-unknown-unknown
    cargo build --target wasm32-unknown-unknown --release
    ```

3.  **Generate Engine Manifest** (For LLM Context):
    ```bash
    cd engine-ts
    npx tsx scripts/gen-manifest.ts
    ```
    This will create `generated/manifest.txt`.

4.  **Run Dev Server**:
    ```bash
    cd engine-ts
    npm run dev
    ```

## Vibe Coding Workflow

1.  Paste `generated/manifest.txt` into your LLM prompt.
2.  Ask the LLM to create units or levels in `game-data/`.
3.  The engine will hot-reload the new data.
