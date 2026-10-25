import type { Point } from '../model/types';
import { ringSelfIntersects } from './topology';
import { signedArea } from './contourExtractor';

function ringArea(points: Point[]): number {
  return Math.abs(signedArea(points));
}

function distanceSq(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-16) return (point.x - a.x) ** 2 + (point.y - a.y) ** 2;
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const toleranceSq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let best = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const value = distanceSq(points[i], points[first], points[last]);
      if (value > best) {
        best = value;
        index = i;
      }
    }
    if (index !== -1 && best > toleranceSq) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, index) => keep[index]).map((point) => ({ ...point }));
}

/** Closed-ring Douglas-Peucker, split into two open arcs at the farthest pair. */
export function simplifyRing(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3 || tolerance <= 0) return points.map((point) => ({ ...point }));
  let far = 0;
  let farDistance = -1;
  for (let index = 1; index < points.length; index++) {
    const value = (points[index].x - points[0].x) ** 2 + (points[index].y - points[0].y) ** 2;
    if (value > farDistance) {
      farDistance = value;
      far = index;
    }
  }
  const first = points.slice(0, far + 1);
  const second = [...points.slice(far), points[0]];
  const a = simplifyOpen(first, tolerance);
  const b = simplifyOpen(second, tolerance);
  const merged = [...a.slice(0, -1), ...b.slice(0, -1)];
  return merged.length >= 3 ? merged : points.map((point) => ({ ...point }));
}

/**
 * One corner-cutting pass on a closed ring. The cut distance is capped in
 * pixels: classic Chaikin cuts a quarter of each edge, which on a long straight
 * edge (the image border, a road) erodes metres of geometry. Capping keeps the
 * fillet local to the raster staircase, so large polygons keep their area while
 * pixel corners are rounded off.
 */
function chaikinOnce(points: Point[], maxCut = 1.6): Point[] {
  if (points.length < 4) return points;
  const output: Point[] = [];
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const inLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outLength = Math.hypot(next.x - current.x, next.y - current.y);
    const inT = inLength > 1e-9 ? Math.min(0.25, maxCut / inLength) : 0;
    const outT = outLength > 1e-9 ? Math.min(0.25, maxCut / outLength) : 0;
    output.push(
      { x: current.x + (previous.x - current.x) * inT, y: current.y + (previous.y - current.y) * inT },
      { x: current.x + (next.x - current.x) * outT, y: current.y + (next.y - current.y) * outT },
    );
  }
  return output;
}

/** Open-chain variant: endpoints stay fixed, interior corners are filleted. */
function chaikinOpen(points: Point[], maxCut = 1.6): Point[] {
  if (points.length < 3) return points.map((point) => ({ ...point }));
  const output: Point[] = [{ ...points[0] }];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const inLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outLength = Math.hypot(next.x - current.x, next.y - current.y);
    const inT = inLength > 1e-9 ? Math.min(0.25, maxCut / inLength) : 0;
    const outT = outLength > 1e-9 ? Math.min(0.25, maxCut / outLength) : 0;
    output.push(
      { x: current.x + (previous.x - current.x) * inT, y: current.y + (previous.y - current.y) * inT },
      { x: current.x + (next.x - current.x) * outT, y: current.y + (next.y - current.y) * outT },
    );
  }
  output.push({ ...points[points.length - 1] });
  return output;
}

export function smoothAndSimplifyOpen(
  chain: Point[],
  tolerance: number,
  smoothingIterations: number,
  minTolerance = 0.5,
): Point[] {
  const base = cleanRing(chain);
  if (base.length < 4) return chain.map((point) => ({ ...point }));
  if (base.length < 12) return chain.map((point) => ({ ...point }));
  let smoothed = chain.map((point) => ({ ...point }));
  const count = Math.max(0, Math.min(3, Math.round(smoothingIterations)));
  for (let iteration = 0; iteration < count; iteration++) smoothed = chaikinOpen(smoothed);
  const tol = Math.max(minTolerance, tolerance);
  const simplified = cleanRing(simplifyOpen(smoothed, tol));
  if (simplified.length < 2) return chain.map((point) => ({ ...point }));
  return simplified;
}

export function chaikinRing(points: Point[], iterations: number): Point[] {
  let ring = points.map((point) => ({ ...point }));
  const count = Math.max(0, Math.min(3, Math.round(iterations)));
  // Simple shapes with few vertices (rectangles, wedges) keep their sharp
  // corners instead of being rounded into blobs.
  if (ring.length < 12) return ring;
  for (let iteration = 0; iteration < count; iteration++) ring = chaikinOnce(ring);
  return ring;
}

function cleanRing(points: Point[]): Point[] {
  const output: Point[] = [];
  for (const point of points) {
    const last = output[output.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 1e-7) continue;
    output.push(point);
  }
  if (output.length > 2) {
    const first = output[0];
    const last = output[output.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-7) output.pop();
  }
  return output;
}

/**
 * Smooths the raster staircase, then simplifies with a tolerance derived from the
 * pixel size. If simplification introduces a self-intersection the tolerance is
 * halved (up to three attempts); the last resort is the smoothed, unsimplified
 * ring, which is still valid by construction.
 */
export function smoothAndSimplify(
  ring: Point[],
  tolerance: number,
  smoothingIterations: number,
  minTolerance = 0.5,
): Point[] {
  const base = cleanRing(ring);
  if (base.length < 4) return base;
  // Small features (a boulder, a lone tree, a narrow sliver) must keep their
  // shape: smoothing them would change their area by a large fraction.
  if (base.length < 12 || ringArea(base) < 120) return base;
  const smoothed = cleanRing(chaikinRing(base, smoothingIterations));
  const tol = Math.max(minTolerance, tolerance);
  let attempt = tol;
  for (let round = 0; round < 3; round++) {
    const candidate = cleanRing(simplifyRing(smoothed, attempt));
    if (candidate.length >= 3 && !ringSelfIntersects(candidate)) return candidate;
    attempt /= 2;
  }
  return smoothed.length >= 3 ? smoothed : base;
}

/** Perimeter used by the shape-index filter. */
export function ringPerimeter(points: Point[]): number {
  let perimeter = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return perimeter;
}
