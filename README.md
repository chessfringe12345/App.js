# Quoridor — 2-Player Online Game

A production-ready, real-time 2-player Quoridor game built with vanilla HTML/CSS/JS on the frontend and Node.js + Express + Socket.io on the backend.

## Setup

```bash
cd server
npm install
npm run dev
```

Then open **http://localhost:3000** in two browser tabs (or on two devices).

## How to play

1. **Player A** clicks **Create Game** — a 6-character room code appears.
2. **Player B** clicks **Join Game**, enters the code, and clicks **Join**.
3. The game starts automatically. Player 1 moves first.

## Game rules

- Player 1 (red) starts at the bottom center and must reach the top row.
- Player 2 (blue) starts at the top center and must reach the bottom row.
- On each turn, either **move your pawn** (click a highlighted cell) or **place a wall** (toggle Wall mode, hover to preview, click to confirm).
- Each player starts with 10 walls. Walls cannot block all paths to a player's goal.
- Jump over the opponent's pawn if they're directly in your path; jump diagonally if the straight jump is blocked.

## Project structure

```
/
├── server/
│   ├── index.js          Express + Socket.io server
│   ├── GameState.js      Pure game logic (with inline unit tests)
│   ├── pathfinding.js    BFS path validator
│   └── package.json
├── client/
│   ├── index.html        Single-page app
│   ├── game.js           Socket.io client + canvas rendering
│   └── style.css         All styles
└── README.md
```

## Run unit tests

```bash
cd server
node GameState.js
```

## Production notes

- All game rule validation happens server-side; the client is a pure renderer.
- Rooms are in-memory. The server supports multiple concurrent rooms.
- Rooms are auto-destroyed when both players disconnect.
- No database or authentication required.
