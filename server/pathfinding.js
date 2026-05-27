'use strict';

/**
 * Check if movement between two adjacent cells is blocked by any wall.
 * Direction is determined by comparing from and to positions.
 */
function isMovementBlocked(from, to, walls) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;

  for (const w of walls) {
    if (dr === -1 && dc === 0) {
      // Moving UP from {R,C}: blocked by H wall with row=R-1 and (col=C or col=C-1)
      if (w.orientation === 'H' && w.row === from.row - 1 &&
          (w.col === from.col || w.col === from.col - 1)) {
        return true;
      }
    } else if (dr === 1 && dc === 0) {
      // Moving DOWN from {R,C}: blocked by H wall with row=R and (col=C or col=C-1)
      if (w.orientation === 'H' && w.row === from.row &&
          (w.col === from.col || w.col === from.col - 1)) {
        return true;
      }
    } else if (dr === 0 && dc === -1) {
      // Moving LEFT from {R,C}: blocked by V wall with col=C-1 and (row=R or row=R-1)
      if (w.orientation === 'V' && w.col === from.col - 1 &&
          (w.row === from.row || w.row === from.row - 1)) {
        return true;
      }
    } else if (dr === 0 && dc === 1) {
      // Moving RIGHT from {R,C}: blocked by V wall with col=C and (row=R or row=R-1)
      if (w.orientation === 'V' && w.col === from.col &&
          (w.row === from.row || w.row === from.row - 1)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * BFS to check if pawn at pawnPos can reach goalRow given current walls.
 * @param {{ row: number, col: number }} pawnPos
 * @param {number} goalRow
 * @param {Array<{ row: number, col: number, orientation: string }>} walls
 * @returns {boolean}
 */
function hasPath(pawnPos, goalRow, walls) {
  const visited = Array.from({ length: 9 }, () => new Array(9).fill(false));
  const queue = [{ row: pawnPos.row, col: pawnPos.col }];
  visited[pawnPos.row][pawnPos.col] = true;

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.row === goalRow) return true;

    const neighbors = [
      { row: cur.row - 1, col: cur.col },
      { row: cur.row + 1, col: cur.col },
      { row: cur.row, col: cur.col - 1 },
      { row: cur.row, col: cur.col + 1 },
    ];

    for (const next of neighbors) {
      if (next.row < 0 || next.row > 8 || next.col < 0 || next.col > 8) continue;
      if (visited[next.row][next.col]) continue;
      if (isMovementBlocked(cur, next, walls)) continue;
      visited[next.row][next.col] = true;
      queue.push(next);
    }
  }

  return false;
}

module.exports = { hasPath, isMovementBlocked };
