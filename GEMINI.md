# GEMINI.md - Project Context

## Project Overview
This is a **3D Game Starter Template** developed using **Three.js** and **Vite**. It features a top-down perspective "room" where a player (cube) can move, jump, and shoot. The project emphasizes performance by using Vanilla JS and CSS without heavy frameworks.

### Key Features
- **3D Rendering**: Built with Three.js, including shadows and custom shaders.
- **Physics & Collision**: Manual implementation of AABB collision for walls, obstacles, and vertical (Y-axis) movement/jumping.
- **Anaglyph 3D**: A custom-implemented anaglyph (Red/Cyan) 3D effect with adjustable intensity.
- **Input Handling**: Supports Keyboard and Gamepad (via Gamepad API).
- **Procedural Audio**: Uses Web Audio API to synthesize "shot" and "explosion" sounds without external assets.
- **Translucency Logic**: Dynamic wall/obstacle translucency when they obstruct the view between the camera and the player.

## Building and Running
The project uses **Vite** for its build pipeline.

- **Install Dependencies**: `npm install`
- **Development Server**: `npm run dev` (Starts at `http://localhost:5173`)
- **Build for Production**: `npm run build` (Outputs to `dist/`)
- **Preview Production Build**: `npm run preview`

## Technical Stack
- **Core**: Three.js (r182+)
- **Build Tool**: Vite (v7+)
- **Language**: Vanilla JavaScript (ES Modules)
- **Styling**: Vanilla CSS

## Development Conventions
- **Entry Point**: `main.js` contains the entire game logic, including the scene setup, game loop, and classes.
- **OOP Structure**: 
  - `Player`: Handles movement, input, energy, and HUD updates.
  - `Projectile`: Handles movement, collision detection, and destruction of bullets.
  - `CustomAnaglyphEffect`: A custom post-processing pass for 3D stereoscopy.
- **Collision Logic**: Uses `THREE.Box3` for intersection tests. Vertical movement checks ground levels against all collidable objects.
- **Visuals**: Uses `EdgesGeometry` to give meshes a "wireframe/outline" look.
- **Deployment**: Configured for GitHub Pages via `vite.config.js`.

## Key Files
- `index.html`: Main entry point and HUD structure.
- `main.js`: Main game logic and Three.js implementation.
- `style.css`: Styles for the game canvas and HUD elements.
- `vite.config.js`: Vite configuration including base paths and server settings.
- `requests.md`: Historical list of implemented features/requirements (in Portuguese).
