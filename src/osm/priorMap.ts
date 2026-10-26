import type { OsmWay, Point } from '../model/types';
import type { ClassPriorMap } from '../classify/types';
import { hasPrior, isClosedWay, osmSemanticOf } from './semantic';

export interface OsmPriorStats {
  areas: number;
  lines: number;
  trees: number;
  /** Pixels that received at least one prior. */
  pixels: number;
  byClass: Record<1 | 2 | 3 | 4, number>;
}

export interface OsmPriorResult {
  prior: ClassPriorMap;
  stats: OsmPriorStats;
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function emptyStats(): OsmPriorStats {
  return { areas: 0, lines: 0, trees: 0, pixels: 0, byClass: { 1: 0, 2: 0, 3: 0, 4: 0 } };
}

export function cleanRing(points: Point[]): Point[] {
  if (points.length < 3) return [];
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) return points.slice(0, -1);
  return points.slice();
}

/**
 * Scanline fill with even-odd parity, so outer rings and their holes are
 * handled together without a separate subtraction pass. The visitor sees every
 * covered pixel exactly once; both the prior map and the agreement report use
 * this single implementation.
 */
export function rasterizeRings(
  rings: Point[][],
  width: number,
  height: number,
  visit: (pixel: number) => void,
): void {
  const edges: Edge[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a.y < minY) minY = a.y;
      if (a.y > maxY) maxY = a.y;
      if (a.y === b.y) continue;
      edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  if (!edges.length || !Number.isFinite(minY) || !Number.isFinite(maxY)) return;
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  const intersections: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const scanY = y + 0.5;
    intersections.length = 0;
    for (const edge of edges) {
      if ((edge.y1 <= scanY && edge.y2 > scanY) || (edge.y2 <= scanY && edge.y1 > scanY)) {
        intersections.push(edge.x1 + ((scanY - edge.y1) * (edge.x2 - edge.x1)) / (edge.y2 - edge.y1));
      }
    }
    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const start = Math.max(0, Math.ceil(intersections[index] - 0.5));
      const end = Math.min(width - 1, Math.floor(intersections[index + 1] - 0.5));
      const row = y * width;
      for (let x = start; x <= end; x++) visit(row + x);
    }
  }
}

function fillRings(
  classes: Uint8Array,
  strength: Float32Array,
  width: number,
  height: number,
  rings: Point[][],
  classId: 1 | 2 | 3 | 4,
  weight: number,
  stats: OsmPriorStats,
): void {
  let painted = false;
  rasterizeRings(rings, width, height, (pixel) => {
    if (weight > strength[pixel] + 0.02) {
      if (strength[pixel] === 0) stats.pixels++;
      classes[pixel] = classId;
      strength[pixel] = weight;
      painted = true;
    }
  });
  if (painted) stats.byClass[classId]++;
}

/** Stamps a small disk along a segment, which is enough for road/stream priors. */
function stampLine(
  classes: Uint8Array,
  strength: Float32Array,
  width: number,
  height: number,
  a: Point,
  b: Point,
  halfWidth: number,
  classId: 1 | 2 | 3 | 4,
  weight: number,
  stats: OsmPriorStats,
): void {
  const radius = Math.max(1, Math.ceil(halfWidth));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length * 2));
  const extent = (halfWidth + 0.55) ** 2;
  let painted = false;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const cx = Math.round(a.x + dx * t);
    const cy = Math.round(a.y + dy * t);
    for (let oy = -radius; oy <= radius; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= height) continue;
      const row = y * width;
      for (let ox = -radius; ox <= radius; ox++) {
        if (ox * ox + oy * oy > extent) continue;
        const x = cx + ox;
        if (x < 0 || x >= width) continue;
        const pixel = row + x;
        if (weight > strength[pixel] + 0.02) {
          if (strength[pixel] === 0) stats.pixels++;
          classes[pixel] = classId;
          strength[pixel] = weight;
          painted = true;
        }
      }
    }
  }
  if (painted) stats.byClass[classId]++;
}

/**
 * Builds the OSM prior at the classifier's working resolution. Coordinates are
 * still in source-image pixels; only the raster size changes.
 */
export function buildOsmPriorMap(
  ways: OsmWay[],
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
): OsmPriorResult {
  const classes = new Uint8Array(width * height);
  const strength = new Float32Array(width * height);
  const stats = emptyStats();
  if (!ways.length || width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    return { prior: { width, height, classes, strength }, stats };
  }
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;
  const scale = Math.min(scaleX, scaleY);
  const project = (point: Point): Point => ({ x: point.x * scaleX, y: point.y * scaleY });

  for (const way of ways) {
    const info = osmSemanticOf(way);
    if (!hasPrior(info)) continue;
    if (way.kind === 'tree') {
      const point = project(way.coords[0]);
      stampLine(
        classes,
        strength,
        width,
        height,
        point,
        point,
        Math.max(1, 1.4 * scale),
        info.priorClass as 1 | 2 | 3 | 4,
        info.priorWeight * 0.75,
        stats,
      );
      stats.trees++;
      continue;
    }
    if (!way.coords.length) continue;
    if (info.area && isClosedWay(way)) {
      const rings = [cleanRing(way.coords.map(project))];
      for (const hole of way.holes ?? []) {
        const ring = cleanRing(hole.map(project));
        if (ring.length >= 3) rings.push(ring);
      }
      if (!rings[0].length) continue;
      fillRings(
        classes,
        strength,
        width,
        height,
        rings,
        info.priorClass as 1 | 2 | 3 | 4,
        info.priorWeight,
        stats,
      );
      stats.areas++;
      continue;
    }
    if (info.featureKind === 'line' || info.lineWidthPx > 0) {
      const points = way.coords.map(project);
      const halfWidth = Math.max(0.65, (info.lineWidthPx * scale) / 2);
      const priorWeight = info.priorWeight * 0.85;
      for (let index = 1; index < points.length; index++) {
        stampLine(
          classes,
          strength,
          width,
          height,
          points[index - 1],
          points[index],
          halfWidth,
          info.priorClass as 1 | 2 | 3 | 4,
          priorWeight,
          stats,
        );
      }
      stats.lines++;
    }
  }

  return { prior: { width, height, classes, strength }, stats };
}
