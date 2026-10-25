import type { Point } from '../model/types';

export interface ContourRing {
  points: Point[];
  closed: true;
  orientation: 'cw' | 'ccw';
}

interface EdgeStore {
  fromX: number[];
  fromY: number[];
  toX: number[];
  toY: number[];
  angles: number[];
  outgoing: Map<number, number[]>;
}

const TAU = Math.PI * 2;

function normalizeAngle(angle: number): number {
  let value = angle % TAU;
  if (value < 0) value += TAU;
  return value;
}

function vertexKey(x: number, y: number, stride: number): number {
  return y * stride + x;
}

function removeCollinear(points: Point[]): Point[] {
  if (points.length < 4) return points;
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    result.push(point);
  }
  if (result.length < 4) return result;
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length; index++) {
      const previous = result[(index - 1 + result.length) % result.length];
      const current = result[index];
      const next = result[(index + 1) % result.length];
      const cross = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x);
      if (Math.abs(cross) < 1e-9) {
        result.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

/**
 * A pixel-boundary loop may touch itself at a grid vertex (two arms of the same
 * 4-connected region meeting at a corner). Such a ring is not simple and cannot
 * be exported as a GeoJSON ring. Walk the loop and cut every repeated vertex
 * into its own closed ring: the union of the pieces is identical to the original
 * area, and each piece is a simple ring by construction.
 */
export function splitAtRepeatedVertices(points: Point[]): Point[][] {
  const loops: Point[][] = [];
  let path: Point[] = [];
  const seen = new Map<string, number>();

  for (const point of points) {
    const key = `${point.x},${point.y}`;
    const previous = seen.get(key);
    if (previous === undefined) {
      seen.set(key, path.length);
      path.push(point);
      continue;
    }
    const loop = path.slice(previous);
    if (loop.length >= 3) loops.push(loop);
    // Keep the repeated vertex as the continuation point, drop only the loop.
    path = path.slice(0, previous + 1);
    seen.clear();
    path.forEach((item, index) => seen.set(`${item.x},${item.y}`, index));
  }
  if (path.length >= 3) loops.push(path);
  return loops;
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
 * Traces the boundary of a binary mask along pixel edges and follows the planar
 * face graph. Every ring is closed by construction; directed edges carry the
 * filled region on their left, and at a pinch vertex the next edge is the first
 * one counter-clockwise from the twin, which keeps diagonally touching pixels
 * in separate rings. No marching-squares saddle heuristic is involved.
 */
export function extractContours(mask: Uint8Array, width: number, height: number): ContourRing[] {
  const stride = width + 1;
  const store: EdgeStore = {
    fromX: [],
    fromY: [],
    toX: [],
    toY: [],
    angles: [],
    outgoing: new Map(),
  };

  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const index = store.fromX.length;
    store.fromX.push(x1);
    store.fromY.push(y1);
    store.toX.push(x2);
    store.toY.push(y2);
    store.angles.push(normalizeAngle(Math.atan2(y2 - y1, x2 - x1)));
    const key = vertexKey(x1, y1, stride);
    const list = store.outgoing.get(key);
    if (list) list.push(index);
    else store.outgoing.set(key, [index]);
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

  const edgeCount = store.fromX.length;
  if (!edgeCount) return [];
  const used = new Uint8Array(edgeCount);
  const rings: ContourRing[] = [];

  const keyOf = (x: number, y: number) => vertexKey(x, y, stride);

  for (let start = 0; start < edgeCount; start++) {
    if (used[start]) continue;
    const points: Point[] = [];
    let current = start;
    let guard = 0;
    let closed = false;

    while (guard++ <= edgeCount + 1) {
      used[current] = 1;
      points.push({ x: store.fromX[current], y: store.fromY[current] });
      const endX = store.toX[current];
      const endY = store.toY[current];
      const candidates = store.outgoing.get(keyOf(endX, endY)) ?? [];
      if (!candidates.length) break;

      const reverse = normalizeAngle(store.angles[current] + Math.PI);
      let next = -1;
      let bestDelta = Infinity;
      for (const candidate of candidates) {
        let delta = normalizeAngle(store.angles[candidate] - reverse);
        if (delta < 1e-7) delta += TAU;
        if (delta < bestDelta) {
          bestDelta = delta;
          next = candidate;
        }
      }
      if (next < 0) break;
      if (next === start) {
        closed = true;
        break;
      }
      if (used[next]) break;
      current = next;
    }

    if (!closed) continue;
    for (const loop of splitAtRepeatedVertices(points)) {
      const clean = removeCollinear(loop);
      if (clean.length < 3) continue;
      const area = signedArea(clean);
      if (Math.abs(area) < 0.5) continue;
      rings.push({ points: clean, closed: true, orientation: area > 0 ? 'cw' : 'ccw' });
    }
  }

  return rings;
}
