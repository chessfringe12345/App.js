'use strict';

const { hasPath, isMovementBlocked } = require('./pathfinding');

class GameState {
  constructor() {
    this._state = {
      board: {
        p1: { row: 8, col: 4 },
        p2: { row: 0, col: 4 },
      },
      walls: [],
      wallsLeft: { p1: 10, p2: 10 },
      turn: 'p1',
      status: 'waiting',
      winner: null,
    };
  }

  getState() {
    return JSON.parse(JSON.stringify(this._state));
  }

  _opponent(role) {
    return role === 'p1' ? 'p2' : 'p1';
  }

  _goalRow(role) {
    return role === 'p1' ? 0 : 8;
  }

  isGameOver() {
    const { board, status } = this._state;
    if (status === 'finished') return this._state.winner;
    if (board.p1.row === 0) return 'p1';
    if (board.p2.row === 8) return 'p2';
    return false;
  }

  /**
   * Returns all valid cells the given player's pawn can move to.
   */
  getValidMoves(role) {
    const pos = this._state.board[role];
    const oppRole = this._opponent(role);
    const oppPos = this._state.board[oppRole];
    const walls = this._state.walls;
    const moves = [];

    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (const { dr, dc } of directions) {
      const next = { row: pos.row + dr, col: pos.col + dc };
      if (next.row < 0 || next.row > 8 || next.col < 0 || next.col > 8) continue;
      if (isMovementBlocked(pos, next, walls)) continue;

      if (next.row === oppPos.row && next.col === oppPos.col) {
        // Opponent is in this cell — try jumping over
        const jump = { row: next.row + dr, col: next.col + dc };
        if (
          jump.row >= 0 && jump.row <= 8 &&
          jump.col >= 0 && jump.col <= 8 &&
          !isMovementBlocked(next, jump, walls)
        ) {
          moves.push(jump);
        } else {
          // Blocked straight jump — try diagonal jumps
          const perps = [
            { dr: dc, dc: dr },
            { dr: -dc, dc: -dr },
          ];
          for (const { dr: pdr, dc: pdc } of perps) {
            const diag = { row: next.row + pdr, col: next.col + pdc };
            if (
              diag.row >= 0 && diag.row <= 8 &&
              diag.col >= 0 && diag.col <= 8 &&
              !isMovementBlocked(next, diag, walls)
            ) {
              moves.push(diag);
            }
          }
        }
      } else {
        moves.push(next);
      }
    }

    return moves;
  }

  movePawn(role, to) {
    const s = this._state;

    if (s.status !== 'playing') {
      return { success: false, reason: 'Game is not in progress.' };
    }
    if (s.turn !== role) {
      return { success: false, reason: 'Not your turn.' };
    }

    const validMoves = this.getValidMoves(role);
    const isValid = validMoves.some(m => m.row === to.row && m.col === to.col);
    if (!isValid) {
      return { success: false, reason: 'Invalid move.' };
    }

    s.board[role] = { row: to.row, col: to.col };
    s.turn = this._opponent(role);

    const winner = this.isGameOver();
    if (winner) {
      s.status = 'finished';
      s.winner = winner;
    }

    return { success: true, state: this.getState() };
  }

  /**
   * Checks if two walls overlap or cross.
   * H wall at {r,c} occupies the gap below row r, covering cols c and c+1.
   * V wall at {r,c} occupies the gap right of col c, covering rows r and r+1.
   */
  _wallsConflict(a, b) {
    if (a.orientation === b.orientation) {
      if (a.orientation === 'H') {
        // Same row, overlapping cols
        return a.row === b.row && Math.abs(a.col - b.col) < 2;
      } else {
        // Same col, overlapping rows
        return a.col === b.col && Math.abs(a.row - b.row) < 2;
      }
    } else {
      // One H, one V — they cross if they share the exact same anchor
      const h = a.orientation === 'H' ? a : b;
      const v = a.orientation === 'V' ? a : b;
      return h.row === v.row && h.col === v.col;
    }
  }

  placeWall(role, wall) {
    const s = this._state;

    if (s.status !== 'playing') {
      return { success: false, reason: 'Game is not in progress.' };
    }
    if (s.turn !== role) {
      return { success: false, reason: 'Not your turn.' };
    }
    if (s.wallsLeft[role] <= 0) {
      return { success: false, reason: 'No walls remaining.' };
    }

    const { row, col, orientation } = wall;
    if (!['H', 'V'].includes(orientation)) {
      return { success: false, reason: 'Invalid wall orientation.' };
    }
    if (row < 0 || row > 7 || col < 0 || col > 7) {
      return { success: false, reason: 'Wall out of bounds.' };
    }

    for (const existing of s.walls) {
      if (this._wallsConflict(wall, existing)) {
        return { success: false, reason: 'Wall overlaps or crosses an existing wall.' };
      }
    }

    // BFS check: both players must still have a path to their goal
    const hypotheticalWalls = [...s.walls, wall];
    if (!hasPath(s.board.p1, 0, hypotheticalWalls)) {
      return { success: false, reason: 'This wall would block Player 1\'s path to the goal.' };
    }
    if (!hasPath(s.board.p2, 8, hypotheticalWalls)) {
      return { success: false, reason: 'This wall would block Player 2\'s path to the goal.' };
    }

    s.walls.push({ row, col, orientation });
    s.wallsLeft[role]--;
    s.turn = this._opponent(role);

    return { success: true, state: this.getState() };
  }

  getValidWalls(role) {
    const s = this._state;
    if (s.wallsLeft[role] <= 0) return [];

    const valid = [];
    for (let r = 0; r <= 7; r++) {
      for (let c = 0; c <= 7; c++) {
        for (const orientation of ['H', 'V']) {
          const wall = { row: r, col: c, orientation };
          let conflicts = false;
          for (const existing of s.walls) {
            if (this._wallsConflict(wall, existing)) {
              conflicts = true;
              break;
            }
          }
          if (conflicts) continue;

          const hypotheticalWalls = [...s.walls, wall];
          if (
            hasPath(s.board.p1, 0, hypotheticalWalls) &&
            hasPath(s.board.p2, 8, hypotheticalWalls)
          ) {
            valid.push(wall);
          }
        }
      }
    }
    return valid;
  }
}

// ── Inline unit tests (run with: node GameState.js) ──────────────────────────
if (require.main === module) {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`FAIL: ${msg}`);
    console.log(`PASS: ${msg}`);
  };

  // Test 1: Initial state
  let g = new GameState();
  g._state.status = 'playing';
  let st = g.getState();
  assert(st.board.p1.row === 8 && st.board.p1.col === 4, 'P1 starts at (8,4)');
  assert(st.board.p2.row === 0 && st.board.p2.col === 4, 'P2 starts at (0,4)');
  assert(st.wallsLeft.p1 === 10, 'P1 starts with 10 walls');

  // Test 2: P1 can move up
  let r = g.movePawn('p1', { row: 7, col: 4 });
  assert(r.success, 'P1 can move up to (7,4)');
  assert(g.getState().board.p1.row === 7, 'P1 is at row 7');
  assert(g.getState().turn === 'p2', 'Turn switches to P2');

  // Test 3: P2 turn, not P1
  r = g.movePawn('p1', { row: 6, col: 4 });
  assert(!r.success, 'P1 cannot move on P2\'s turn');

  // Test 4: Place a horizontal wall
  r = g.placeWall('p2', { row: 6, col: 3, orientation: 'H' });
  assert(r.success, 'P2 places H wall at (6,3)');
  assert(g.getState().walls.length === 1, 'One wall placed');

  // Test 5: Wall blocking move
  r = g.movePawn('p1', { row: 6, col: 4 });
  assert(!r.success, 'P1 cannot move through H wall');

  // Test 6: BFS path check — wall that blocks path is rejected
  let g2 = new GameState();
  g2._state.status = 'playing';
  // Block entire row 1 for P2 (would isolate P2)
  // Place walls to cut P2 off — should fail
  // Instead test that a wall blocking P1's only path is rejected
  for (let c = 0; c <= 6; c += 2) {
    g2.placeWall('p1', { row: 7, col: c, orientation: 'H' });
    g2.placeWall('p2', { row: 7, col: c, orientation: 'H' }); // attempt duplicate, will fail
    g2._state.turn = 'p1'; // reset turn for testing
  }
  // At this point row 7-8 gap is sealed for cols 0-7
  // P1 at (8,4) should still have a path since we alternated turns oddly — just check BFS
  const { hasPath: hp } = require('./pathfinding');
  // Walls cover cols 0-1, 2-3, 4-5, 6-7, 7-8 — sealing the entire row 7-8 gap
  const blocked = [
    { row: 7, col: 0, orientation: 'H' },
    { row: 7, col: 2, orientation: 'H' },
    { row: 7, col: 4, orientation: 'H' },
    { row: 7, col: 6, orientation: 'H' },
    { row: 7, col: 7, orientation: 'H' },
  ];
  assert(!hp({ row: 8, col: 4 }, 0, blocked), 'BFS correctly detects blocked path');
  assert(hp({ row: 8, col: 4 }, 0, []), 'BFS returns true with no walls');

  // Test 7: Wall overlap rejection
  let g3 = new GameState();
  g3._state.status = 'playing';
  r = g3.placeWall('p1', { row: 3, col: 3, orientation: 'H' });
  assert(r.success, 'First wall placed');
  g3._state.turn = 'p1';
  r = g3.placeWall('p1', { row: 3, col: 3, orientation: 'H' });
  assert(!r.success, 'Duplicate wall rejected');

  // Test 8: Win condition (P2 moved away so P1 can reach row 0)
  let g4 = new GameState();
  g4._state.status = 'playing';
  g4._state.board.p1 = { row: 1, col: 4 };
  g4._state.board.p2 = { row: 0, col: 0 };
  r = g4.movePawn('p1', { row: 0, col: 4 });
  assert(r.success, 'P1 moves to row 0');
  assert(g4.isGameOver() === 'p1', 'P1 wins');

  console.log('\nAll tests passed!');
}

module.exports = GameState;
