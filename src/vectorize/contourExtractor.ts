import type { Point } from '../model/types';

export interface ContourRing {
  points: Point[];
  closed: true;
  orientation: 'cw' | 'ccw';
}

/**
 * A pixel-boundary loop may touch itself at a grid vertex (two arms of the same
 * 4-connected region meeting at a corner). Such a ring is not simple and cannot
 * be exported as a GeoJSON ring. Walk the loop and cut every repeated vertex
 * into its own closed ring: the union of the pieces is identical to the original
 * area, and each piece is a simple ring by construction.
 *
 * Works on positional indices so the hot extraction path never builds millions
 * of coordinate strings; the exported wrapper maps them back to points.
 */
function repeatedLoops<K>(keys: K[]): number[][] {
  const loops: number[][] = [];
  const path: number[] = [];
  const seen = new Map<K, number>();

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const previous = seen.get(key);
    if (previous === undefined) {
      seen.set(key, path.length);
      path.push(index);
      continue;
    }
    const loop = path.slice(previous);
    if (loop.length >= 3) loops.push(loop);
    // Truncate to the first occurrence. Only the tail disappears, so the
    // positions of the surviving prefix remain valid; drop their map entries
    // instead of rebuilding the whole index (the old code rescanned the path on
    // every cut, which was quadratic on self-touching rings).
    for (let position = path.length - 1; position > previous; position--) {
      seen.delete(keys[path[position]]);
    }
    path.length = previous + 1;
  }
  if (path.length >= 3) loops.push(path);
  return loops;
}

export function splitAtRepeatedVertices(points: Point[]): Point[][] {
  const keys = points.map((point) => `${point.x},${point.y}`);
  return repeatedLoops(keys).map((loop) => loop.map((index) => points[index]));
}

export function signedArea(points: Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Removes collinear vertices from a closed ring in linear time.
 *
 * The previous implementation restarted the scan from index 0 after every
 * removal, which is O(n²) on long pixel staircases — the dominant cost on large
 * orthophotos. A circular doubly-linked list plus a work queue visits each
 * vertex a constant number of times.
 */
function removeCollinear(points: Point[]): Point[] {
  const count = points.length;
  if (count < 4) return points;
  const alive = new Uint8Array(count).fill(1);
  const previous = new Int32Array(count);
  const next = new Int32Array(count);
  for (let index = 0; index < count; index++) {
    previous[index] = (index - 1 + count) % count;
    next[index] = (index + 1) % count;
  }

  const queue = new Int32Array(count * 4);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < count; index++) queue[tail++] = index;

  let remaining = count;
  while (head < tail) {
    const index = queue[head++];
    if (!alive[index] || remaining <= 3) continue;
    const before = previous[index];
    const after = next[index];
    const a = points[before];
    const b = points[index];
    const c = points[after];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) >= 1e-9) continue;
    alive[index] = 0;
    remaining--;
    next[before] = after;
    previous[after] = before;
    queue[tail++] = before;
    queue[tail++] = after;
  }

  const result: Point[] = [];
  for (let index = 0; index < count; index++) {
    if (alive[index]) result.push(points[index]);
  }
  return result;
}

/**
 * Traces the boundary of a binary mask along pixel edges and follows the planar
 * face graph. Every ring is closed by construction; directed edges carry the
 * filled region on their left, and at a pinch vertex the next edge is the first
 * one counter-clockwise from the twin, which keeps diagonally touching pixels
 * in separate rings. No marching-squares saddle heuristic is involved.
 *
 * Edges are stored flat and linked by vertex with an Int32 head table. The old
 * Map<number, number[]> allocated one array per boundary vertex and called
 * Math.atan2 for every edge; boundary directions are axis-aligned, so a modulo
 * turn comparison is exact and much cheaper.
 */
export function extractContours(mask: Uint8Array, width: number, height: number): ContourRing[] {
  const stride = width + 1;
  const vertexCount = stride * (height + 1);
  const firstOut = new Int32Array(vertexCount).fill(-1);
  const fromX: number[] = [];
  const fromY: number[] = [];
  const toX: number[] = [];
  const toY: number[] = [];
  const directions: number[] = [];
  const nextOut: number[] = [];

  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const edge = fromX.length;
    fromX.push(x1);
    fromY.push(y1);
    toX.push(x2);
    toY.push(y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    // 0 = +x, 1 = +y, 2 = -x, 3 = -y (screen coordinates, y downwards).
    directions.push(dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3);
    const fromKey = y1 * stride + x1;
    nextOut.push(firstOut[fromKey]);
    firstOut[fromKey] = edge;
  };

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      // Interior on the left of each directed edge (screen coordinates, y down).
      if (y === 0 || !mask[(y - 1) * width + x]) addEdge(x + 1, y, x, y);
      if (x === width - 1 || !mask[row + x + 1]) addEdge(x + 1, y + 1, x + 1, y);
      if (y === height - 1 || !mask[(y + 1) * width + x]) addEdge(x, y + 1, x + 1, y + 1);
      if (x === 0 || !mask[row + x - 1]) addEdge(x, y, x, y + 1);
    }
  }

  const edgeCount = fromX.length;
  if (!edgeCount) return [];
  const used = new Uint8Array(edgeCount);
  const rings: ContourRing[] = [];

  for (let start = 0; start < edgeCount; start++) {
    if (used[start]) continue;
    const path: number[] = [];
    let current = start;
    let guard = 0;
    let closed = false;

    while (guard++ <= edgeCount + 1) {
      used[current] = 1;
      path.push(fromY[current] * stride + fromX[current]);
      const endKey = toY[current] * stride + toX[current];
      const reverse = (directions[current] + 2) & 3;
      let chosen = -1;
      let bestTurn = 5;
      for (let candidate = firstOut[endKey]; candidate !== -1; candidate = nextOut[candidate]) {
        let turn = (directions[candidate] - reverse + 4) & 3;
        // Reversing along the twin is the last resort, as before.
        if (turn === 0) turn = 4;
        if (turn < bestTurn || (turn === bestTurn && candidate < chosen)) {
          bestTurn = turn;
          chosen = candidate;
        }
      }
      if (chosen < 0) break;
      if (chosen === start) {
        closed = true;
        break;
      }
      if (used[chosen]) break;
      current = chosen;
    }

    if (!closed) continue;
    for (const loop of repeatedLoops(path)) {
      const points: Point[] = loop.map((index) => {
        const key = path[index];
        return { x: key % stride, y: (key / stride) | 0 };
      });
      const clean = removeCollinear(points);
      if (clean.length < 3) continue;
      const area = signedArea(clean);
      if (Math.abs(area) < 0.5) continue;
      rings.push({ points: clean, closed: true, orientation: area > 0 ? 'cw' : 'ccw' });
    }
  }

  return rings;
}
