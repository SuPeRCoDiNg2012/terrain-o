import type { Point } from '../model/types';

export interface ScalarGrid {
  values: Float32Array;
  cols: number;
  rows: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export interface Isoline {
  coords: Point[];
  closed: boolean;
}

function interpolate(a: Point, b: Point, va: number, vb: number, level: number): Point {
  const denominator = vb - va;
  const t = Math.abs(denominator) < 1e-12 ? 0.5 : (level - va) / denominator;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Scalar-field marching squares for contour lines (DEM), independent of polygons. */
export function marchingSquares(grid: ScalarGrid, level: number): Segment[] {
  const { values, cols, rows } = grid;
  const segments: Segment[] = [];

  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const v00 = values[y * cols + x];
      const v10 = values[y * cols + x + 1];
      const v11 = values[(y + 1) * cols + x + 1];
      const v01 = values[(y + 1) * cols + x];
      if (![v00, v10, v11, v01].every(Number.isFinite)) continue;

      const top: Point = { x, y };
      const right: Point = { x: x + 1, y };
      const bottom: Point = { x: x + 1, y: y + 1 };
      const left: Point = { x, y: y + 1 };

      const topPoint = interpolate(top, right, v00, v10, level);
      const rightPoint = interpolate(right, bottom, v10, v11, level);
      const bottomPoint = interpolate(bottom, left, v11, v01, level);
      const leftPoint = interpolate(left, top, v01, v00, level);

      let caseIndex = 0;
      if (v00 >= level) caseIndex |= 1;
      if (v10 >= level) caseIndex |= 2;
      if (v11 >= level) caseIndex |= 4;
      if (v01 >= level) caseIndex |= 8;
      if (caseIndex === 0 || caseIndex === 15) continue;

      const center = (v00 + v10 + v11 + v01) / 4 >= level;
      switch (caseIndex) {
        case 1:
        case 14:
          segments.push({ a: leftPoint, b: topPoint });
          break;
        case 2:
        case 13:
          segments.push({ a: topPoint, b: rightPoint });
          break;
        case 3:
        case 12:
          segments.push({ a: leftPoint, b: rightPoint });
          break;
        case 4:
        case 11:
          segments.push({ a: rightPoint, b: bottomPoint });
          break;
        case 5:
          if (center) {
            segments.push({ a: topPoint, b: rightPoint }, { a: bottomPoint, b: leftPoint });
          } else {
            segments.push({ a: leftPoint, b: topPoint }, { a: rightPoint, b: bottomPoint });
          }
          break;
        case 6:
        case 9:
          segments.push({ a: topPoint, b: bottomPoint });
          break;
        case 7:
        case 8:
          segments.push({ a: leftPoint, b: bottomPoint });
          break;
        case 10:
          if (center) {
            segments.push({ a: leftPoint, b: topPoint }, { a: rightPoint, b: bottomPoint });
          } else {
            segments.push({ a: topPoint, b: rightPoint }, { a: bottomPoint, b: leftPoint });
          }
          break;
      }
    }
  }

  return segments;
}

function key(point: Point): string {
  return `${Math.round(point.x * 10000)}:${Math.round(point.y * 10000)}`;
}

/** Chains segments into closed or open polylines. */
export function stitchSegments(segments: Segment[]): Isoline[] {
  if (!segments.length) return [];
  const adjacency = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (const point of [segment.a, segment.b]) {
      const list = adjacency.get(key(point)) ?? [];
      list.push(index);
      adjacency.set(key(point), list);
    }
  });

  const used = new Uint8Array(segments.length);
  const lines: Isoline[] = [];

  const other = (index: number, point: Point): Point =>
    key(segments[index].a) === key(point) ? segments[index].b : segments[index].a;

  const nextUnused = (point: Point): number | null => {
    const candidates = adjacency.get(key(point)) ?? [];
    for (const candidate of candidates) if (!used[candidate]) return candidate;
    return null;
  };

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const coords: Point[] = [segments[start].a, segments[start].b];
    let closed = false;

    // Forward from the last point.
    while (true) {
      const endpoint = coords[coords.length - 1];
      const next = nextUnused(endpoint);
      if (next == null) break;
      const point = other(next, endpoint);
      used[next] = 1;
      if (key(point) === key(coords[0])) {
        closed = true;
        break;
      }
      coords.push(point);
    }

    // Backward from the first point, unless the ring already closed.
    if (!closed) {
      while (true) {
        const endpoint = coords[0];
        const next = nextUnused(endpoint);
        if (next == null) break;
        const point = other(next, endpoint);
        used[next] = 1;
        if (key(point) === key(coords[coords.length - 1])) {
          closed = true;
          break;
        }
        coords.unshift(point);
      }
    }

    const clean: Point[] = [];
    for (const point of coords) {
      const last = clean[clean.length - 1];
      if (last && Math.abs(last.x - point.x) < 1e-9 && Math.abs(last.y - point.y) < 1e-9) continue;
      clean.push(point);
    }
    if (clean.length >= 2) lines.push({ coords: clean, closed });
  }

  return lines;
}
