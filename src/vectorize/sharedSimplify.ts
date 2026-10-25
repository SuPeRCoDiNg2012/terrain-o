import type { Point } from '../model/types';
import { ringSelfIntersects } from './topology';
import { smoothAndSimplify, smoothAndSimplifyOpen } from './simplify';

export interface SharedRingInput {
  points: Point[];
  classId: number;
}

const keyOf = (point: Point): string => `${point.x},${point.y}`;

interface JunctionChain {
  points: Point[];
  closed: boolean;
}

function buildChains(ring: Point[], junction: Set<string>): JunctionChain[] {
  const keys = ring.map(keyOf);
  const junctionIndices: number[] = [];
  keys.forEach((key, index) => {
    if (junction.has(key)) junctionIndices.push(index);
  });

  if (junctionIndices.length <= 1) return [{ points: ring, closed: true }];

  const chains: JunctionChain[] = [];
  for (let index = 0; index < junctionIndices.length; index++) {
    const start = junctionIndices[index];
    const end = junctionIndices[(index + 1) % junctionIndices.length];
    const points: Point[] = [];
    if (end > start) {
      for (let position = start; position <= end; position++) points.push(ring[position]);
    } else {
      for (let position = start; position < ring.length; position++) points.push(ring[position]);
      for (let position = 0; position <= end; position++) points.push(ring[position]);
    }
    if (points.length >= 2) chains.push({ points, closed: false });
  }
  return chains;
}

/**
 * Simplifies a set of class rings while keeping shared boundaries shared.
 *
 * Rings traced from neighbouring classes run along the exact same pixel edges
 * in opposite directions. Simplifying each ring independently therefore cuts
 * the common boundary twice in different places, leaving gaps and overlaps. This
 * function builds the global boundary graph, splits rings at graph junctions
 * (degree != 2), simplifies every chain once and reuses the result for every
 * ring that traverses it. Adjacent polygons end up with identical boundary
 * vertices, which is what makes the GeoJSON export watertight.
 */
export function simplifySharedRings(
  rings: SharedRingInput[],
  tolerance: number,
  smoothingIterations: number,
  minTolerance = 0.5,
): SharedRingInput[] {
  if (rings.length === 0) return rings;

  // Undirected edge set, so a boundary shared by two classes only counts once.
  const edges = new Set<string>();
  const degree = new Map<string, number>();
  for (const ring of rings) {
    const points = ring.points;
    for (let index = 0; index < points.length; index++) {
      const a = keyOf(points[index]);
      const b = keyOf(points[(index + 1) % points.length]);
      if (a === b) continue;
      const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edges.has(edgeKey)) continue;
      edges.add(edgeKey);
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
  }
  const junction = new Set<string>();
  for (const [key, value] of degree) if (value !== 2) junction.add(key);

  const cache = new Map<string, Point[]>();
  const simplifyChain = (points: Point[], closed: boolean): Point[] => {
    const forward = points.map(keyOf);
    const backward = [...forward].reverse();
    const forwardKey = forward.join('|');
    const backwardKey = backward.join('|');
    // The cache is orientation-free: store one canonical direction and mirror
    // it for the other caller. Comparing the SIMPLIFIED cache content against
    // the original forward key (the previous code) always looked "reversed"
    // because simplification removes points, so every second ring traversed a
    // shared boundary backwards — a real topology defect, not a cosmetic one.
    const canonicalForward = forwardKey <= backwardKey;
    const canonical = canonicalForward ? forwardKey : backwardKey;
    const cached = cache.get(canonical);
    const mirror = (ring: Point[]): Point[] =>
      canonicalForward ? ring.map((point) => ({ ...point })) : [...ring].reverse().map((point) => ({ ...point }));

    if (cached) return mirror(cached);

    const oriented = canonicalForward ? points : [...points].reverse();
    const simplified = closed
      ? smoothAndSimplify(oriented, tolerance, smoothingIterations, minTolerance)
      : smoothAndSimplifyOpen(oriented, tolerance, smoothingIterations, minTolerance);
    cache.set(canonical, simplified);
    return mirror(simplified);
  };

  const result: SharedRingInput[] = rings.map((ring) => {
    const chains = buildChains(ring.points, junction);
    if (chains.length === 1 && chains[0].closed) {
      return { ...ring, points: simplifyChain(chains[0].points, true) };
    }
    const rebuilt: Point[] = [];
    chains.forEach((chain, index) => {
      const simplified = simplifyChain(chain.points, chain.closed);
      for (const point of simplified) {
        const last = rebuilt[rebuilt.length - 1];
        if (last && Math.abs(last.x - point.x) < 1e-9 && Math.abs(last.y - point.y) < 1e-9) continue;
        rebuilt.push(point);
      }
      if (index === chains.length - 1) {
        const first = rebuilt[0];
        const last = rebuilt[rebuilt.length - 1];
        if (first && last && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) rebuilt.pop();
      }
    });
    return { ...ring, points: rebuilt };
  });

  // Safety net: if independent chains crossed each other, fall back to the raw
  // rings rather than exporting an invalid polygon.
  const invalid = result.some((ring) => ring.points.length >= 4 && ringSelfIntersects(ring.points));
  return invalid ? rings : result;
}

export function ringArea(points: Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}
