import type { Feature, Point } from '../model/types';
import { pointInRing } from '../vectorize/topology';

/**
 * Merges every automatic source into one symbol layer without duplicate
 * overlapping symbols.
 *
 * Safety rules, in order:
 *  - manual and verified geometry is never removed or modified;
 *  - only automatic duplicates are dropped;
 *  - two protected duplicates are both kept and reported as a conflict;
 *  - geometry coordinates are never rewritten here.
 */
export interface SymbolFusionOptions {
  /** Approximate intersection-over-union that makes two areas duplicates. */
  overlapThreshold: number;
  /** A polygon almost completely inside another is a duplicate even if the IoU is low. */
  containmentThreshold: number;
  /** Two points of the same symbol closer than this (source pixels) are one. */
  pointDistancePx: number;
  /** Maximum distance between two line vertices that still counts as coincident. */
  lineTolerancePx: number;
  /** Fraction of both lines that must run along each other to be a duplicate. */
  lineOverlapThreshold: number;
}

export const DEFAULT_SYMBOL_FUSION_OPTIONS: SymbolFusionOptions = {
  overlapThreshold: 0.4,
  containmentThreshold: 0.8,
  pointDistancePx: 6,
  lineTolerancePx: 3.5,
  lineOverlapThreshold: 0.7,
};

export interface SymbolFusionStats {
  before: number;
  after: number;
  removed: number;
  mergedGroups: number;
  protectedConflicts: number;
  byType: Record<string, number>;
}

export interface SymbolFusionResult {
  features: Feature[];
  removed: Feature[];
  stats: SymbolFusionStats;
}

function isProtected(feature: Feature): boolean {
  if (feature.verified) return true;
  // Undefined source means a feature drawn before the field existed: treat it
  // as manual, never as disposable automatic data.
  return feature.source == null || feature.source === 'manual' || feature.source === 'gpx';
}

function precedence(feature: Feature): number {
  if (feature.verified) return 5;
  if (feature.source === 'osm') return 3;
  if (feature.source === 'ml') return 2;
  if (feature.source === 'vector' || feature.source === 'dem') return 1;
  return 4;
}

function isFusable(feature: Feature): boolean {
  if (feature.kind === 'area') return feature.coords.length >= 3;
  if (feature.kind === 'line') return feature.coords.length >= 2;
  return feature.kind === 'point' && feature.coords.length === 1;
}

function symbolKey(feature: Feature): string {
  return `${feature.kind}:${feature.type}`;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(feature: Feature): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of feature.coords) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

function ringArea(points: Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function featureArea(feature: Feature): number {
  if (feature.kind !== 'area') return 0;
  const holes = (feature.holes ?? []).reduce((sum, hole) => sum + ringArea(hole), 0);
  return Math.max(0, ringArea(feature.coords) - holes);
}

function inside(feature: Feature, point: Point): boolean {
  if (!pointInRing(point, feature.coords)) return false;
  for (const hole of feature.holes ?? []) {
    if (hole.length >= 3 && pointInRing(point, hole)) return false;
  }
  return true;
}

interface Overlap {
  iou: number;
  containA: number;
  containB: number;
}

function approximateOverlap(a: Feature, b: Feature): Overlap {
  const boxA = boundsOf(a);
  const boxB = boundsOf(b);
  const minX = Math.max(boxA.minX, boxB.minX);
  const maxX = Math.min(boxA.maxX, boxB.maxX);
  const minY = Math.max(boxA.minY, boxB.minY);
  const maxY = Math.min(boxA.maxY, boxB.maxY);
  if (maxX - minX < 0.5 || maxY - minY < 0.5) return { iou: 0, containA: 0, containB: 0 };

  const steps = 14;
  let both = 0;
  let onlyA = 0;
  let onlyB = 0;
  for (let row = 0; row < steps; row++) {
    const y = minY + ((row + 0.5) / steps) * (maxY - minY);
    for (let column = 0; column < steps; column++) {
      const x = minX + ((column + 0.5) / steps) * (maxX - minX);
      const point = { x, y };
      const inA = inside(a, point);
      const inB = inside(b, point);
      if (inA && inB) both++;
      else if (inA) onlyA++;
      else if (inB) onlyB++;
    }
  }
  const union = both + onlyA + onlyB;
  return {
    iou: union ? both / union : 0,
    containA: both + onlyA ? both / (both + onlyA) : 0,
    containB: both + onlyB ? both / (both + onlyB) : 0,
  };
}

function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-9) return Math.hypot(point.x - a.x, point.y - a.y);
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function lineLength(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function distanceToLine(point: Point, points: Point[]): number {
  let best = Infinity;
  for (let index = 1; index < points.length; index++) {
    const distance = pointToSegmentDistance(point, points[index - 1], points[index]);
    if (distance < best) best = distance;
  }
  return best;
}

/**
 * Fraction of `a` that runs within `tolerance` of `b`. Sampling by arc length
 * keeps long and short lines comparable and is independent of vertex density.
 */
function lineCoverage(a: Point[], b: Point[], tolerance: number): number {
  const length = lineLength(a);
  if (length <= 1e-6) return 0;
  const samples = Math.max(8, Math.min(180, Math.ceil(length / Math.max(1, tolerance))));
  let hits = 0;
  for (let index = 0; index < samples; index++) {
    const target = (index / (samples - 1)) * length;
    let walked = 0;
    let sample = a[a.length - 1];
    for (let segment = 1; segment < a.length; segment++) {
      const start = a[segment - 1];
      const end = a[segment];
      const span = Math.hypot(end.x - start.x, end.y - start.y);
      if (walked + span >= target && span > 1e-9) {
        const t = (target - walked) / span;
        sample = { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) };
        break;
      }
      walked += span;
    }
    if (distanceToLine(sample, b) <= tolerance) hits++;
  }
  return hits / samples;
}

function isDuplicate(a: Feature, b: Feature, options: SymbolFusionOptions): boolean {
  if (a.kind === 'point' || b.kind === 'point') {
    if (!a.coords.length || !b.coords.length) return false;
    return Math.hypot(a.coords[0].x - b.coords[0].x, a.coords[0].y - b.coords[0].y) <= options.pointDistancePx;
  }
  if (a.kind === 'line' || b.kind === 'line') {
    if (a.kind !== 'line' || b.kind !== 'line') return false;
    const lengthA = lineLength(a.coords);
    const lengthB = lineLength(b.coords);
    if (lengthA <= 1e-6 || lengthB <= 1e-6) return false;
    // A short path lying on a long road is a different feature, not a duplicate.
    if (Math.min(lengthA, lengthB) / Math.max(lengthA, lengthB) < 0.4) return false;
    const forward = lineCoverage(a.coords, b.coords, options.lineTolerancePx);
    const backward = lineCoverage(b.coords, a.coords, options.lineTolerancePx);
    return Math.min(forward, backward) >= options.lineOverlapThreshold;
  }
  const overlap = approximateOverlap(a, b);
  return (
    overlap.iou >= options.overlapThreshold ||
    Math.max(overlap.containA, overlap.containB) >= options.containmentThreshold
  );
}

export function fuseSymbols(
  features: Feature[],
  partialOptions: Partial<SymbolFusionOptions> = {},
): SymbolFusionResult {
  const options = { ...DEFAULT_SYMBOL_FUSION_OPTIONS, ...partialOptions };
  const groups = new Map<string, Feature[]>();
  const untouched: Feature[] = [];

  for (const feature of features) {
    if (!isFusable(feature)) {
      untouched.push(feature);
      continue;
    }
    const key = symbolKey(feature);
    const group = groups.get(key);
    if (group) group.push(feature);
    else groups.set(key, [feature]);
  }

  const kept: Feature[] = [];
  const removed: Feature[] = [];
  const merged = new Map<string, string[]>();
  const byType: Record<string, number> = {};
  let mergedGroups = 0;
  let protectedConflicts = 0;

  for (const group of groups.values()) {
    group.sort((a, b) => {
      const priority = precedence(b) - precedence(a);
      if (priority !== 0) return priority;
      const area = featureArea(b) - featureArea(a);
      if (area !== 0) return area;
      return a.id.localeCompare(b.id);
    });

    const accepted: Feature[] = [];
    // Tree nodes arrive by the thousand from OSM; a linear scan would be
    // quadratic. A grid one cell wide keeps point deduplication near-linear.
    const isPointGroup = group[0]?.kind === 'point';
    const pointCell = Math.max(1, options.pointDistancePx);
    const pointIndex = new Map<string, Feature[]>();
    const pointKey = (feature: Feature) =>
      `${Math.floor(feature.coords[0].x / pointCell)}:${Math.floor(feature.coords[0].y / pointCell)}`;
    const remember = (feature: Feature) => {
      if (!isPointGroup) return;
      const key = pointKey(feature);
      const bucket = pointIndex.get(key);
      if (bucket) bucket.push(feature);
      else pointIndex.set(key, [feature]);
    };
    const forget = (feature: Feature) => {
      if (!isPointGroup) return;
      const key = pointKey(feature);
      const bucket = pointIndex.get(key);
      if (!bucket) return;
      const next = bucket.filter((item) => item.id !== feature.id);
      if (next.length) pointIndex.set(key, next);
      else pointIndex.delete(key);
    };
    const nearbyPoints = (feature: Feature): Feature[] => {
      if (!isPointGroup) return accepted;
      const x = Math.floor(feature.coords[0].x / pointCell);
      const y = Math.floor(feature.coords[0].y / pointCell);
      const result: Feature[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = pointIndex.get(`${x + dx}:${y + dy}`);
          if (bucket) result.push(...bucket);
        }
      }
      return result;
    };

    for (const candidate of group) {
      const duplicate = nearbyPoints(candidate).find((other) => isDuplicate(candidate, other, options));
      if (!duplicate) {
        accepted.push(candidate);
        remember(candidate);
        continue;
      }

      const candidateProtected = isProtected(candidate);
      const otherProtected = isProtected(duplicate);
      if (candidateProtected && otherProtected) {
        // Never touch either one: report the conflict and keep both.
        protectedConflicts++;
        accepted.push(candidate);
        remember(candidate);
        continue;
      }
      if (candidateProtected && !otherProtected) {
        // Higher precedence always sorts first, so this is defensive only.
        const index = accepted.indexOf(duplicate);
        if (index >= 0) accepted.splice(index, 1);
        forget(duplicate);
        removed.push(duplicate);
        mergedGroups++;
        accepted.push(candidate);
        remember(candidate);
        continue;
      }

      // Automatic candidate: drop it. If the survivor is also automatic, keep
      // an audit trail of the ids merged into it.
      removed.push(candidate);
      mergedGroups++;
      if (!otherProtected) {
        const list = merged.get(duplicate.id) ?? [];
        if (!list.includes(candidate.id)) list.push(candidate.id);
        merged.set(duplicate.id, list);
      }
    }

    for (const feature of accepted) {
      const mergedIds = merged.get(feature.id);
      if (mergedIds?.length && !isProtected(feature)) {
        kept.push({ ...feature, mergedFrom: [...(feature.mergedFrom ?? []), ...mergedIds] });
      } else {
        kept.push(feature);
      }
    }
  }

  // Keep the original order as much as possible: untouched features first in
  // their original slots, then the accepted symbols. The project renders in
  // array order, so stable output avoids visual jumps.
  const keptIds = new Set(kept.map((feature) => feature.id));
  const keptById = new Map(kept.map((feature) => [feature.id, feature]));
  const untouchedIds = new Set(untouched.map((feature) => feature.id));
  const ordered: Feature[] = [];
  for (const feature of features) {
    if (keptIds.has(feature.id)) {
      ordered.push(keptById.get(feature.id)!);
      keptIds.delete(feature.id);
    } else if (untouchedIds.has(feature.id)) {
      ordered.push(feature);
    }
  }
  for (const feature of kept) if (keptIds.has(feature.id)) ordered.push(feature);

  // Count every symbol that remains, including manual lines and course points
  // that fusion never touches, so the panel can describe the whole layer.
  for (const feature of ordered) byType[feature.type] = (byType[feature.type] ?? 0) + 1;

  return {
    features: ordered,
    removed,
    stats: {
      before: features.length,
      after: ordered.length,
      removed: removed.length,
      mergedGroups,
      protectedConflicts,
      byType,
    },
  };
}
