'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const CELL_COUNT = 9;
const GAP = 8;      // px gap between cells (wall zone width)
let CELL = 60;      // px per cell — recalculated on resize

const COLORS = {
  bg:         '#242220',
  cell:       '#2E2C28',
  border:     '#3D3B36',
  wall:       '#F0EBE0',
  p1:         '#E85D4A',
  p2:         '#4A90D9',
  validMove:  'rgba(72, 199, 142, 0.35)',
  validEdge:  'rgba(72, 199, 142, 0.9)',
  ghostWall:  'rgba(240, 192, 96, 0.55)',
  accent:     '#F0C060',
};

// ── State ──────────────────────────────────────────────────────────────────
let socket;
let roomCode = null;
let myRole   = null;      // 'p1' | 'p2'
let gameState = null;     // server state object
let wallMode  = false;
let validMoves = [];      // array of {row,col}
let ghostWall  = null;    // {row,col,orientation} or null
let rematchRequested = false;

// ── DOM refs ───────────────────────────────────────────────────────────────
const screens = {
  lobby:   document.getElementById('screen-lobby'),
  waiting: document.getElementById('screen-waiting'),
  game:    document.getElementById('screen-game'),
};
const canvas       = document.getElementById('board-canvas');
const ctx          = canvas.getContext('2d');
const boardWrapper = document.getElementById('board-wrapper');
const toast        = document.getElementById('toast');
const overlay      = document.getElementById('overlay');

// ── Screen management ──────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 2800) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Canvas sizing ──────────────────────────────────────────────────────────
function computeCanvasSize() {
  const maxW = Math.min(window.innerWidth - 280, window.innerHeight - 80, 620);
  const available = Math.max(maxW, 320);
  CELL = Math.floor((available - (CELL_COUNT - 1) * GAP) / CELL_COUNT);
  const totalPx = CELL * CELL_COUNT + GAP * (CELL_COUNT - 1);

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = totalPx * dpr;
  canvas.height = totalPx * dpr;
  canvas.style.width  = `${totalPx}px`;
  canvas.style.height = `${totalPx}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Convert cell row/col to canvas pixel (top-left corner of cell)
function cellToXY(row, col) {
  return {
    x: col * (CELL + GAP),
    y: row * (CELL + GAP),
  };
}

// ── Drawing ────────────────────────────────────────────────────────────────
function drawBoard() {
  const totalPx = CELL * CELL_COUNT + GAP * (CELL_COUNT - 1);
  ctx.clearRect(0, 0, totalPx, totalPx);

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, totalPx, totalPx);

  // Cells
  for (let r = 0; r < CELL_COUNT; r++) {
    for (let c = 0; c < CELL_COUNT; c++) {
      const { x, y } = cellToXY(r, c);
      ctx.fillStyle = COLORS.cell;
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  if (!gameState) return;

  // Valid move highlights
  for (const m of validMoves) {
    const { x, y } = cellToXY(m.row, m.col);
    ctx.fillStyle = COLORS.validMove;
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.validEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Placed walls
  for (const w of gameState.walls) {
    drawWall(w.row, w.col, w.orientation, COLORS.wall, 1.0);
  }

  // Ghost wall preview
  if (ghostWall && wallMode) {
    drawWall(ghostWall.row, ghostWall.col, ghostWall.orientation, COLORS.ghostWall, 1.0);
  }

  // Pawns
  drawPawn(gameState.board.p1.row, gameState.board.p1.col, COLORS.p1, 'P1');
  drawPawn(gameState.board.p2.row, gameState.board.p2.col, COLORS.p2, 'P2');
}

function drawWall(row, col, orientation, color, alpha) {
  const { x, y } = cellToXY(row, col);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  if (orientation === 'H') {
    // Horizontal wall: spans below row R, across cols C and C+1
    const wx = x;
    const wy = y + CELL;
    const ww = CELL * 2 + GAP;
    const wh = GAP;
    ctx.fillRect(wx, wy, ww, wh);
  } else {
    // Vertical wall: spans right of col C, across rows R and R+1
    const wx = x + CELL;
    const wy = y;
    const ww = GAP;
    const wh = CELL * 2 + GAP;
    ctx.fillRect(wx, wy, ww, wh);
  }

  ctx.globalAlpha = 1.0;
}

function drawPawn(row, col, color, label) {
  const { x, y } = cellToXY(row, col);
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const r  = CELL * 0.32;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Inner highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(10, CELL * 0.22)}px 'Space Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);
}

// ── HUD update ─────────────────────────────────────────────────────────────
function updateHUD() {
  if (!gameState) return;

  const turnRole = gameState.turn;
  const dot  = document.getElementById('turn-dot');
  const text = document.getElementById('turn-text');
  dot.style.background  = turnRole === 'p1' ? COLORS.p1 : COLORS.p2;
  text.textContent      = turnRole === 'p1' ? 'Player 1' : 'Player 2';

  document.getElementById('walls-p1').textContent = `P1: ${gameState.wallsLeft.p1}`;
  document.getElementById('walls-p2').textContent = `P2: ${gameState.wallsLeft.p2}`;

  const modeLabel = document.getElementById('mode-label');
  modeLabel.textContent = wallMode ? 'Wall' : 'Move';
  modeLabel.style.color = wallMode ? COLORS.accent : 'var(--text-muted)';

  const wallBtn = document.getElementById('btn-wall-mode');
  const myTurn  = gameState.turn === myRole;
  const hasWalls = gameState.wallsLeft[myRole] > 0;
  wallBtn.disabled = !myTurn || !hasWalls || gameState.status !== 'playing';
  wallBtn.className = 'btn' + (wallMode ? ' active-mode' : '');

  document.getElementById('hud-room-code').textContent = roomCode || '—';
}

// ── Valid moves ────────────────────────────────────────────────────────────
function refreshValidMoves() {
  if (!gameState || gameState.status !== 'playing' || gameState.turn !== myRole || wallMode) {
    validMoves = [];
    return;
  }

  const pos = gameState.board[myRole];
  const opp = myRole === 'p1' ? 'p2' : 'p1';
  const oppPos = gameState.board[opp];
  const walls = gameState.walls;

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const moves = [];

  for (const [dr, dc] of dirs) {
    const nr = pos.row + dr, nc = pos.col + dc;
    if (nr < 0 || nr > 8 || nc < 0 || nc > 8) continue;
    if (isMovementBlocked(pos, { row: nr, col: nc }, walls)) continue;

    if (nr === oppPos.row && nc === oppPos.col) {
      const jr = nr + dr, jc = nc + dc;
      if (jr >= 0 && jr <= 8 && jc >= 0 && jc <= 8 &&
          !isMovementBlocked({ row: nr, col: nc }, { row: jr, col: jc }, walls)) {
        moves.push({ row: jr, col: jc });
      } else {
        const perps = [[dc, dr], [-dc, -dr]];
        for (const [pdr, pdc] of perps) {
          const ddr = nr + pdr, ddc = nc + pdc;
          if (ddr >= 0 && ddr <= 8 && ddc >= 0 && ddc <= 8 &&
              !isMovementBlocked({ row: nr, col: nc }, { row: ddr, col: ddc }, walls)) {
            moves.push({ row: ddr, col: ddc });
          }
        }
      }
    } else {
      moves.push({ row: nr, col: nc });
    }
  }

  validMoves = moves;
}

// Client-side wall blocking check (mirrors server pathfinding.js)
function isMovementBlocked(from, to, walls) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  for (const w of walls) {
    if (dr === -1 && dc === 0) {
      if (w.orientation === 'H' && w.row === from.row - 1 &&
          (w.col === from.col || w.col === from.col - 1)) return true;
    } else if (dr === 1 && dc === 0) {
      if (w.orientation === 'H' && w.row === from.row &&
          (w.col === from.col || w.col === from.col - 1)) return true;
    } else if (dr === 0 && dc === -1) {
      if (w.orientation === 'V' && w.col === from.col - 1 &&
          (w.row === from.row || w.row === from.row - 1)) return true;
    } else if (dr === 0 && dc === 1) {
      if (w.orientation === 'V' && w.col === from.col &&
          (w.row === from.row || w.row === from.row - 1)) return true;
    }
  }
  return false;
}

// ── Mouse → board coordinates ──────────────────────────────────────────────
function canvasToGrid(mx, my) {
  const step = CELL + GAP;

  const col = mx / step;
  const row = my / step;

  const cellCol = Math.floor(col);
  const cellRow = Math.floor(row);
  const fracCol = col - cellCol;
  const fracRow = row - cellRow;

  // Determine if cursor is in a gap
  const inHGap = fracRow > (CELL / step); // horizontal gap (below this cell row)
  const inVGap = fracCol > (CELL / step); // vertical gap (right of this cell col)

  return { cellRow, cellCol, fracRow, fracCol, inHGap, inVGap };
}

function mouseToGhostWall(mx, my) {
  const { cellRow, cellCol, inHGap, inVGap } = canvasToGrid(mx, my);

  // Determine dominant gap direction
  const step = CELL + GAP;
  const distH = (my % step) - CELL;   // distance into horizontal gap
  const distV = (mx % step) - CELL;   // distance into vertical gap

  if (!inHGap && !inVGap) return null; // inside a cell

  let orientation, anchorRow, anchorCol;

  if (inHGap && inVGap) {
    // Corner — pick closest gap
    orientation = (distH < distV) ? 'H' : 'V';
  } else if (inHGap) {
    orientation = 'H';
  } else {
    orientation = 'V';
  }

  if (orientation === 'H') {
    anchorRow = cellRow;
    // Snap: wall spans cols anchorCol and anchorCol+1
    // Pick anchorCol so the cursor is roughly centered on the 2-cell span
    anchorCol = Math.max(0, Math.min(7, cellCol - (mx % (CELL + GAP) > (CELL + GAP) * 0.5 ? 0 : 1)));
    // Simpler: snap to the cell col under cursor or one to the left
    anchorCol = Math.max(0, Math.min(7, Math.round(mx / (CELL + GAP) - 0.5)));
  } else {
    anchorCol = cellCol;
    anchorRow = Math.max(0, Math.min(7, Math.round(my / (CELL + GAP) - 0.5)));
  }

  if (anchorRow < 0 || anchorRow > 7 || anchorCol < 0 || anchorCol > 7) return null;
  return { row: anchorRow, col: anchorCol, orientation };
}

// ── Canvas events ──────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
  if (!gameState || gameState.status !== 'playing') return;
  if (!wallMode || gameState.turn !== myRole) {
    ghostWall = null;
    drawBoard();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const newGhost = mouseToGhostWall(mx, my);

  if (JSON.stringify(newGhost) !== JSON.stringify(ghostWall)) {
    ghostWall = newGhost;
    drawBoard();
  }
});

canvas.addEventListener('mouseleave', () => {
  if (ghostWall) {
    ghostWall = null;
    drawBoard();
  }
});

canvas.addEventListener('click', (e) => {
  if (!gameState || gameState.status !== 'playing') return;
  if (gameState.turn !== myRole) {
    showToast("It's not your turn.");
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (wallMode) {
    const wall = mouseToGhostWall(mx, my);
    if (!wall) return;
    socket.emit('place_wall', { roomCode, wall });
    ghostWall = null;
  } else {
    // Move mode: check if click is on a valid move cell
    const step = CELL + GAP;
    const col = Math.floor(mx / step);
    const row = Math.floor(my / step);
    const fracX = (mx % step) / step;
    const fracY = (my % step) / step;

    if (fracX > CELL / step || fracY > CELL / step) return; // in gap
    if (row < 0 || row > 8 || col < 0 || col > 8) return;

    const isValid = validMoves.some(m => m.row === row && m.col === col);
    if (!isValid) {
      shakeBoard();
      return;
    }
    socket.emit('move_pawn', { roomCode, to: { row, col } });
  }
});

function shakeBoard() {
  boardWrapper.classList.remove('shake');
  void boardWrapper.offsetWidth; // reflow
  boardWrapper.classList.add('shake');
  setTimeout(() => boardWrapper.classList.remove('shake'), 400);
}

// ── Role indicator ─────────────────────────────────────────────────────────
function updateRoleDisplay() {
  const dot  = document.getElementById('my-role-dot');
  const text = document.getElementById('my-role-text');
  if (!myRole) return;
  dot.style.background = myRole === 'p1' ? COLORS.p1 : COLORS.p2;
  text.textContent = myRole === 'p1' ? 'Player 1' : 'Player 2';
}

// ── Game over overlay ──────────────────────────────────────────────────────
function showGameOver(winner) {
  const isMe = winner === myRole;
  document.getElementById('overlay-title').textContent =
    `${winner === 'p1' ? 'Player 1' : 'Player 2'} Wins!`;
  document.getElementById('overlay-sub').textContent =
    isMe ? 'Congratulations!' : 'Better luck next time.';
  overlay.classList.add('active');
  rematchRequested = false;
}

// ── Wall mode toggle ───────────────────────────────────────────────────────
document.getElementById('btn-wall-mode').addEventListener('click', () => {
  wallMode = !wallMode;
  ghostWall = null;
  refreshValidMoves();
  updateHUD();
  drawBoard();
});

// ── Socket.io ─────────────────────────────────────────────────────────────
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected:', socket.id);
  });

  socket.on('room_created', ({ roomCode: code }) => {
    roomCode = code;
    document.getElementById('waiting-code').textContent = code;
    showScreen('waiting');
  });

  socket.on('join_error', ({ reason }) => {
    document.getElementById('lobby-error').textContent = reason;
  });

  socket.on('game_start', ({ playerRole, state }) => {
    myRole = playerRole;
    gameState = state;
    wallMode = false;
    ghostWall = null;
    overlay.classList.remove('active');
    rematchRequested = false;

    showScreen('game');
    computeCanvasSize();
    updateRoleDisplay();
    refreshValidMoves();
    updateHUD();
    drawBoard();
  });

  socket.on('state_update', ({ state }) => {
    gameState = state;
    wallMode = false;
    ghostWall = null;
    refreshValidMoves();
    updateHUD();
    drawBoard();
  });

  socket.on('game_over', ({ winner }) => {
    gameState.status = 'finished';
    gameState.winner = winner;
    validMoves = [];
    ghostWall = null;
    drawBoard();
    updateHUD();
    setTimeout(() => showGameOver(winner), 600);
  });

  socket.on('invalid_move', ({ reason }) => {
    shakeBoard();
    showToast(reason);
  });

  socket.on('opponent_disconnected', () => {
    showToast('Opponent disconnected.', 5000);
    overlay.classList.add('active');
    document.getElementById('overlay-title').textContent = 'Opponent Left';
    document.getElementById('overlay-sub').textContent = 'They disconnected from the game.';
    document.getElementById('btn-rematch').style.display = 'none';
  });

  socket.on('rematch_ready', ({ state }) => {
    gameState = state;
    wallMode = false;
    ghostWall = null;
    overlay.classList.remove('active');
    document.getElementById('btn-rematch').style.display = '';
    rematchRequested = false;
    refreshValidMoves();
    updateHUD();
    drawBoard();
  });
}

// ── Lobby buttons ──────────────────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => {
  document.getElementById('lobby-error').textContent = '';
  socket.emit('create_room');
});

document.getElementById('btn-show-join').addEventListener('click', () => {
  const form = document.getElementById('join-form');
  form.style.display = form.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('btn-join').addEventListener('click', () => {
  document.getElementById('lobby-error').textContent = '';
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 6) {
    document.getElementById('lobby-error').textContent = 'Enter a 6-character room code.';
    return;
  }
  socket.emit('join_room', { roomCode: code });
});

document.getElementById('room-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

document.getElementById('btn-cancel-wait').addEventListener('click', () => {
  socket.disconnect();
  socket.connect();
  roomCode = null;
  showScreen('lobby');
});

document.getElementById('btn-rematch').addEventListener('click', () => {
  if (rematchRequested) return;
  rematchRequested = true;
  socket.emit('rematch', { roomCode });
  document.getElementById('btn-rematch').textContent = 'Waiting…';
  document.getElementById('btn-rematch').disabled = true;
});

document.getElementById('btn-new-game').addEventListener('click', () => {
  overlay.classList.remove('active');
  roomCode = null;
  myRole = null;
  gameState = null;
  document.getElementById('btn-rematch').textContent = 'Rematch';
  document.getElementById('btn-rematch').disabled = false;
  document.getElementById('btn-rematch').style.display = '';
  showScreen('lobby');
});

// ── Resize ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (screens.game.classList.contains('active')) {
    computeCanvasSize();
    drawBoard();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
initSocket();

// Expose for Playwright/devtools access
window._game = {
  get socket()     { return socket; },
  get roomCode()   { return roomCode; },
  get gameState()  { return gameState; },
  get myRole()     { return myRole; },
  get validMoves() { return validMoves; },
};
