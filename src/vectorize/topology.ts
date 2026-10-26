import type { Point } from '../model/types';
import type { PolygonalRegion } from './types';
import { signedArea } from './contourExtractor';

export interface ClassifiedRing {
  points: Point[];
  classId: number;
}

export interface RawPolygon {
  classId: number;
  outer: Point[];
  holes: Point[][];
  area: number;
}

export function ringArea(points: Point[]): number {
  return Math.abs(signedArea(points));
}

export function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Interior point of a ring, used for containment tests without crossings. */
export function interiorPoint(ring: Point[]): Point {
  if (!ring.length) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const point of ring) {
    cx += point.x;
    cy += point.y;
  }
  cx /= ring.length;
  cy /= ring.length;
  const centroid = { x: cx, y: cy };
  if (pointInRing(centroid, ring)) return centroid;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const fallback = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  if (pointInRing(fallback, ring)) return fallback;

  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = cx - mid.x;
    const dy = cy - mid.y;
    const length = Math.hypot(dx, dy) || 1;
    for (const step of [0.01, 0.1, 0.5]) {
      const candidate = { x: mid.x + (dx / length) * step, y: mid.y + (dy / length) * step };
      if (pointInRing(candidate, ring)) return candidate;
    }
  }
  return centroid;
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, b.x) - 1e-9 <= c.x &&
    c.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= c.y &&
    c.y <= Math.max(a.y, b.y) + 1e-9
  );
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y)
  ) {
    return false;
  }
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

export function ringSelfIntersects(points: Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;

  // Sweep over segment bounding boxes instead of testing all n² pairs. Long
  // simplified rings (thousands of vertices) were quadratic here, and this
  // check runs on every polygon before export.
  const minX = new Float64Array(n);
  const maxX = new Float64Array(n);
  const minY = new Float64Array(n);
  const maxY = new Float64Array(n);
  for (let index = 0; index < n; index++) {
    const a = points[index];
    const b = points[(index + 1) % n];
    minX[index] = Math.min(a.x, b.x);
    maxX[index] = Math.max(a.x, b.x);
    minY[index] = Math.min(a.y, b.y);
    maxY[index] = Math.max(a.y, b.y);
  }

  const order = new Array<number>(n);
  for (let index = 0; index < n; index++) order[index] = index;
  order.sort((a, b) => minX[a] - minX[b]);

  for (let position = 0; position < n; position++) {
    const i = order[position];
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let next = position + 1; next < n; next++) {
      const j = order[next];
      if (minX[j] > maxX[i]) break;
      if (j === (i + 1) % n || (j + 1) % n === i) continue;
      if (minY[j] > maxY[i] || maxY[j] < minY[i]) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function cleanRing(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < 1e-9 && Math.abs(last.y - point.y) < 1e-9) continue;
    result.push(point);
  }
  if (result.length > 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) result.pop();
  }
  return result;
}

interface HierarchyNode {
  ring: ClassifiedRing;
  area: number;
  depth: number;
  holes: HierarchyNode[];
  /** Bounding box, used to reject containment candidates in O(1). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Assigns every ring as outer (even nesting depth) or hole (odd depth). Islands
 * inside holes become outer rings again, so even-odd nesting is respected.
 */
export function assemblePolygons(rings: ClassifiedRing[]): RawPolygon[] {
  const byClass = new Map<number, HierarchyNode[]>();
  for (const ring of rings) {
    const points = cleanRing(ring.points);
    if (points.length < 3) continue;
    const area = ringArea(points);
    if (area < 0.75) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    const list = byClass.get(ring.classId) ?? [];
    list.push({ ring: { ...ring, points }, area, depth: 0, holes: [], minX, minY, maxX, maxY });
    byClass.set(ring.classId, list);
  }

  const polygons: RawPolygon[] = [];

  for (const [classId, nodes] of byClass) {
    nodes.sort((a, b) => b.area - a.area);
    const parents = new Map<HierarchyNode, HierarchyNode | null>();

    for (const node of nodes) {
      const probe = interiorPoint(node.ring.points);
      let parent: HierarchyNode | null = null;
      for (const candidate of nodes) {
        if (candidate === node) continue;
        if (candidate.area <= node.area) continue;
        if (
          probe.x < candidate.minX ||
          probe.x > candidate.maxX ||
          probe.y < candidate.minY ||
          probe.y > candidate.maxY
        ) {
          continue;
        }
        if (pointInRing(probe, candidate.ring.points)) {
          if (!parent || candidate.area < parent.area) parent = candidate;
        }
      }
      parents.set(node, parent);
      let depth = 0;
      let current = parent;
      while (current) {
        depth++;
        current = parents.get(current) ?? null;
      }
      node.depth = depth;
    }

    const outers = nodes.filter((node) => node.depth % 2 === 0);
    for (const outer of outers) {
      const holes = nodes
        .filter((node) => node.depth === outer.depth + 1 && parents.get(node) === outer)
        .map((node) => node.ring.points);
      const holeArea = holes.reduce((sum, hole) => sum + ringArea(hole), 0);
      polygons.push({
        classId,
        outer: outer.ring.points,
        holes,
        area: Math.max(0, outer.area - holeArea),
      });
    }
  }

  return polygons;
}

/** Validation used by the export pre-check and by the tuning panel. */
export function validateRegions(regions: Array<Pick<PolygonalRegion, 'featureType' | 'coords' | 'holes' | 'area'>>): string[] {
  const problems: string[] = [];
  regions.forEach((region, index) => {
    const name = `${region.featureType} #${index + 1}`;
    if (region.coords.length < 3) problems.push(`${name}: anello esterno con meno di 3 vertici.`);
    if (ringSelfIntersects(region.coords)) problems.push(`${name}: anello esterno auto-intersecante.`);
    if (region.area <= 0) problems.push(`${name}: area non positiva.`);
    region.holes.forEach((hole, holeIndex) => {
      if (hole.length < 3) problems.push(`${name}: foro ${holeIndex + 1} degenere.`);
      if (ringSelfIntersects(hole)) problems.push(`${name}: foro ${holeIndex + 1} auto-intersecante.`);
      if (!pointInRing(interiorPoint(hole), region.coords)) {
        problems.push(`${name}: foro ${holeIndex + 1} non contenuto nell’anello esterno.`);
      }
    });
  });
  return problems;
}

export function validateRawPolygons(polygons: RawPolygon[]): string[] {
  const problems: string[] = [];
  polygons.forEach((polygon, index) => {
    if (ringSelfIntersects(polygon.outer)) problems.push(`poligono ${index + 1}: contorno auto-intersecante`);
    for (const hole of polygon.holes) {
      if (ringSelfIntersects(hole)) problems.push(`poligono ${index + 1}: foro auto-intersecante`);
    }
  });
  return problems;
}
