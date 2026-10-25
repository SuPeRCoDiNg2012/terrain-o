import type { Feature, Point, Project } from '../model/types';
import { typeKind, typeSpec } from '../model/constants';

export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return pointDistance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return pointDistance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInFeature(feature: Feature, p: Point): boolean {
  if (feature.kind === 'point') return pointDistance(feature.coords[0], p) <= 0;
  if (feature.kind === 'area') {
    if (!pointInPolygon(p, feature.coords)) return false;
    for (const hole of feature.holes ?? []) if (pointInPolygon(p, hole)) return false;
    return true;
  }
  return false;
}

export interface HitOptions {
  tolerancePx: number;
  includePoints?: boolean;
}

/** Finds the topmost feature at a screen/world point. */
export function hitTest(features: Feature[], p: Point, opts: HitOptions): Feature | null {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if (f.kind === 'point') {
      if (opts.includePoints === false) continue;
      if (pointDistance(f.coords[0], p) <= opts.tolerancePx) return f;
      continue;
    }
    if (f.kind === 'line') {
      for (let j = 1; j < f.coords.length; j++) {
        if (distanceToSegment(p, f.coords[j - 1], f.coords[j]) <= opts.tolerancePx) return f;
      }
      continue;
    }
    if (pointInFeature(f, p)) return f;
    for (let j = 1; j < f.coords.length; j++) {
      if (distanceToSegment(p, f.coords[j - 1], f.coords[j]) <= opts.tolerancePx) return f;
    }
    if (f.coords.length > 2) {
      if (distanceToSegment(p, f.coords[f.coords.length - 1], f.coords[0]) <= opts.tolerancePx) return f;
    }
  }
  return null;
}

export interface SnapOptions {
  features: Feature[];
  excludeIds?: Set<string>;
  /** World-unit radius corresponding to 10 screen px. */
  vertexRadius: number;
  gridEnabled: boolean;
  gridSize: number;
}

export interface SnapResult {
  point: Point;
  snapped: 'vertex' | 'grid' | null;
}

export function snapPoint(p: Point, opts: SnapOptions): SnapResult {
  let best: Point | null = null;
  let bestDistance = opts.vertexRadius;
  for (const feature of opts.features) {
    if (opts.excludeIds?.has(feature.id)) continue;
    const vertices = feature.kind === 'area' ? feature.coords : feature.coords;
    for (const vertex of vertices) {
      const d = pointDistance(p, vertex);
      if (d < bestDistance) {
        best = vertex;
        bestDistance = d;
      }
    }
    for (const hole of feature.holes ?? []) {
      for (const vertex of hole) {
        const d = pointDistance(p, vertex);
        if (d < bestDistance) {
          best = vertex;
          bestDistance = d;
        }
      }
    }
  }
  if (best) return { point: { ...best }, snapped: 'vertex' };
  if (opts.gridEnabled && opts.gridSize > 0) {
    return {
      point: { x: Math.round(p.x / opts.gridSize) * opts.gridSize, y: Math.round(p.y / opts.gridSize) * opts.gridSize },
      snapped: 'grid',
    };
  }
  return { point: p, snapped: null };
}

export function closestSegmentIndex(p: Point, coords: Point[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const d = distanceToSegment(p, coords[i - 1], coords[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

export function closestVertex(p: Point, coords: Point[], maxDistance: number): number | null {
  let best: number | null = null;
  let bestDistance = maxDistance;
  coords.forEach((vertex, index) => {
    const d = pointDistance(p, vertex);
    if (d <= bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}

export function insertVertex(coords: Point[], p: Point): Point[] {
  if (coords.length < 2) return [...coords, p];
  const idx = closestSegmentIndex(p, coords);
  return [...coords.slice(0, idx), p, ...coords.slice(idx)];
}

export function featureBounds(feature: Feature): { minX: number; minY: number; maxX: number; maxY: number } {
  const all = [...feature.coords, ...(feature.holes ?? []).flat()];
  return {
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
}

export function featuresBounds(features: Feature[]) {
  const points = features.flatMap((f) => f.coords);
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function offsetLine(coords: Point[], offsetPx: number): Point[] {
  if (coords.length < 2) return coords.map((p) => ({ ...p }));
  return coords.map((p, index) => {
    const prev = coords[Math.max(0, index - 1)];
    const next = coords[Math.min(coords.length - 1, index + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x - (dy / len) * offsetPx, y: p.y + (dx / len) * offsetPx };
  });
}

/** Rotates a closed ring so it starts at the closest vertex to p. */
export function ringStartingAt(ring: Point[], p: Point): Point[] {
  if (ring.length < 2) return ring;
  let best = 0;
  let bestDistance = Infinity;
  ring.forEach((vertex, i) => {
    const d = pointDistance(p, vertex);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return [...ring.slice(best), ...ring.slice(0, best)];
}

export function tourDistance(points: Point[], order: number[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += pointDistance(points[order[i - 1]], points[order[i]]);
  return total;
}

/** Nearest-neighbour + 2-opt heuristic; start and finish stay fixed. */
export function optimizeCourseOrder(project: Project): Map<string, number> {
  const points = project.features
    .filter((f) => f.kind === 'point' && (f.type === 'control' || f.type === 'start' || f.type === 'finish'))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const controls = points.filter((f) => f.type === 'control');
  if (controls.length < 3) return new Map();
  const start = points.find((f) => f.type === 'start');
  const finish = points.find((f) => f.type === 'finish');
  const fixedStart = start ? start.coords[0] : controls[0].coords[0];
  const fixedEnd = finish ? finish.coords[0] : null;
  const candidates = controls.map((c) => c.coords[0]);
  const remaining = new Set(candidates.map((_, i) => i));
  const route: number[] = [];
  let current = fixedStart;
  while (remaining.size) {
    let best = -1;
    let bestDistance = Infinity;
    for (const idx of remaining) {
      const d = pointDistance(current, candidates[idx]);
      if (d < bestDistance) {
        bestDistance = d;
        best = idx;
      }
    }
    route.push(best);
    remaining.delete(best);
    current = candidates[best];
  }
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 40) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const a = i === 0 ? fixedStart : candidates[route[i - 1]];
        const b = candidates[route[i]];
        const c = candidates[route[j]];
        const d = j === route.length - 1 ? (fixedEnd ?? candidates[route[0]]) : candidates[route[j + 1]];
        const old = pointDistance(a, b) + pointDistance(c, d);
        const next = pointDistance(a, c) + pointDistance(b, d);
        if (next + 1e-9 < old) {
          const segment = route.slice(i, j + 1).reverse();
          route.splice(i, segment.length, ...segment);
          improved = true;
        }
      }
    }
  }
  const result = new Map<string, number>();
  route.forEach((idx, i) => result.set(controls[idx].id, i + 1));
  return result;
}

export function typeKindMatches(feature: Feature, type: string): boolean {
  return typeKind(type) === feature.kind;
}

export function defaultNameFor(type: string): string {
  return typeSpec(type).defaultName;
}
