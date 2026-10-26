import type { Point } from '../model/types';
import { extractContours } from './contourExtractor';
import { assemblePolygons, pointInRing, ringArea } from './topology';
import { simplifySharedRings, type SharedRingInput } from './sharedSimplify';
import { meanConfidence, readMasks } from './maskReader';
import { reconcilePolygons } from './edgeReconcile';
import { filterRegions } from './filter';
import { validateRegions } from './topology';
import {
  DEFAULT_VECTORIZE_OPTIONS,
  type PolygonalRegion,
  type VectorizeInput,
  type VectorizeOptions,
  type VectorizeResult,
} from './types';

export type VectorizeStage = 'masks' | 'contours' | 'topology' | 'simplify' | 'reconcile' | 'filter';
export type VectorizeProgress = (stage: VectorizeStage, percent: number) => void;

const CLASS_TO_TYPE: Record<number, string> = {
  1: 'forest',
  2: 'open',
  3: 'water',
  4: 'artificial',
  // Class 5 exists only in the AI label map, where it separates buildings from
  // other artificial surfaces. The rule classifier keeps its four families.
  5: 'building',
};

export function classFeatureType(classId: number): string | null {
  return CLASS_TO_TYPE[classId] ?? null;
}

function mergeOptions(options: Partial<VectorizeOptions> = {}): VectorizeOptions {
  return {
    ...DEFAULT_VECTORIZE_OPTIONS,
    ...options,
    categories: options.categories?.length ? options.categories : DEFAULT_VECTORIZE_OPTIONS.categories,
  };
}

function regionArea(coords: Point[], holes: Point[][]): number {
  const outer = ringArea(coords);
  const inner = holes.reduce((sum, hole) => sum + ringArea(hole), 0);
  return Math.max(0, outer - inner);
}

/**
 * Mean classifier confidence of the pixels that actually belong to one polygon.
 * Using the mean over the whole class mask (the previous behaviour) gave every
 * forest polygon the same confidence, which is misleading in the exported
 * GeoJSON and in the properties panel. A deterministic 16×16 stratified sample
 * inside the polygon is accurate enough and stays bounded even for huge shapes.
 */
function polygonConfidence(
  coords: Point[],
  holes: Point[][],
  mask: Uint8Array,
  confidence: Float32Array,
  width: number,
  height: number,
  fallback: number,
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of coords) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(width - 1, Math.ceil(maxX));
  maxY = Math.min(height - 1, Math.ceil(maxY));
  if (!(maxX >= minX && maxY >= minY)) return fallback;

  const steps = 16;
  const stepX = Math.max(1, (maxX - minX) / steps);
  const stepY = Math.max(1, (maxY - minY) / steps);
  // Hole bounding boxes reject most samples before the O(vertices) test.
  const holeBounds = holes.map((hole) => {
    let holeMinX = Infinity;
    let holeMinY = Infinity;
    let holeMaxX = -Infinity;
    let holeMaxY = -Infinity;
    for (const point of hole) {
      if (point.x < holeMinX) holeMinX = point.x;
      if (point.x > holeMaxX) holeMaxX = point.x;
      if (point.y < holeMinY) holeMinY = point.y;
      if (point.y > holeMaxY) holeMaxY = point.y;
    }
    return { hole, holeMinX, holeMinY, holeMaxX, holeMaxY };
  });
  let sum = 0;
  let count = 0;
  for (let y = minY + stepY / 2; y <= maxY; y += stepY) {
    for (let x = minX + stepX / 2; x <= maxX; x += stepX) {
      const point = { x, y };
      if (!pointInRing(point, coords)) continue;
      let insideHole = false;
      for (const bounds of holeBounds) {
        if (
          x >= bounds.holeMinX &&
          x <= bounds.holeMaxX &&
          y >= bounds.holeMinY &&
          y <= bounds.holeMaxY &&
          pointInRing(point, bounds.hole)
        ) {
          insideHole = true;
          break;
        }
      }
      if (insideHole) continue;
      const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
      const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
      const pixel = py * width + px;
      if (!mask[pixel]) continue;
      sum += confidence[pixel];
      count++;
    }
  }
  return count ? sum / count : fallback;
}

/**
 * Pure vectorization pipeline: labels in, clean polygons out. No DOM, no worker
 * and no classification logic live here; the same function runs in tests, in the
 * preview path and inside the web worker.
 */
export function vectorize(
  input: VectorizeInput,
  partialOptions: Partial<VectorizeOptions> = {},
  callbacks: { onProgress?: VectorizeProgress; signal?: AbortSignal } = {},
): VectorizeResult {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const options = mergeOptions(partialOptions);
  const abort = () => {
    if (callbacks.signal?.aborted) throw new DOMException('Vettorizzazione annullata', 'AbortError');
  };

  callbacks.onProgress?.('masks', 2);
  const masks = readMasks(input, {
    categories: options.categories,
    confidenceThreshold: options.confidenceThreshold,
    hierarchyPriority: options.hierarchyPriority,
  });
  abort();

  const classes = masks.classes.filter((classId) => classFeatureType(classId) != null);
  const regions: PolygonalRegion[] = [];
  let discarded = 0;
  let invalid = 0;
  let dropNextReconcile = false;

  // Contours for every class first: shared boundaries can only be simplified
  // once when both sides are known, otherwise adjacent polygons open a gap.
  const rawRings: SharedRingInput[] = [];
  classes.forEach((classId, classIndex) => {
    abort();
    const mask = masks.masks.get(classId);
    if (!mask) return;
    callbacks.onProgress?.('contours', 8 + Math.round((classIndex / Math.max(1, classes.length)) * 34));
    const rings = extractContours(mask, masks.width, masks.height);
    for (const ring of rings) rawRings.push({ points: ring.points, classId });
  });
  abort();

  callbacks.onProgress?.('simplify', 44);
  const rings = simplifySharedRings(
    rawRings,
    options.simplifyTolerance,
    options.smoothIterations,
  );
  abort();

  classes.forEach((classId, classIndex) => {
    abort();
    const mask = masks.masks.get(classId);
    if (!mask) return;
    const featureType = classFeatureType(classId)!;
    callbacks.onProgress?.('topology', 50 + Math.round((classIndex / Math.max(1, classes.length)) * 20));
    const classRings = rings.filter((ring) => ring.classId === classId);
    const polygons = assemblePolygons(classRings.map((ring) => ({ points: ring.points, classId })));
    const classConfidence = meanConfidence(mask, masks.confidence);

    for (const polygon of polygons) {
      const coords = polygon.outer;
      if (coords.length < 3) {
        invalid++;
        continue;
      }
      const candidate: PolygonalRegion = {
        featureType,
        coords,
        holes: polygon.holes.filter((hole) => hole.length >= 3),
        area: regionArea(coords, polygon.holes),
        classId,
        confidence: polygonConfidence(
          coords,
          polygon.holes,
          mask,
          masks.confidence,
          masks.width,
          masks.height,
          classConfidence,
        ),
      };
      const problems = validateRegions([candidate]);
      if (problems.length) {
        invalid++;
        continue;
      }
      regions.push(candidate);
    }
  });

  abort();
  let reconciled = regions;
  if (options.reconcileEdges && regions.length > 1) {
    callbacks.onProgress?.('reconcile', 78);
    // Snapping must cover the displacement introduced by simplification,
    // otherwise two sides of the same boundary keep different chords.
    reconciled = reconcilePolygons(regions, Math.max(0.7, options.simplifyTolerance * 1.25)).map((region) => ({
      ...region,
      area: regionArea(region.coords, region.holes),
    }));
    const invalidReconciled = validateRegions(reconciled);
    if (invalidReconciled.length) {
      invalid += invalidReconciled.length;
      dropNextReconcile = true;
    }
  }

  callbacks.onProgress?.('filter', 90);
  const usable = dropNextReconcile ? regions : reconciled;
  const filtered = filterRegions(usable, options);
  discarded += filtered.discarded;
  let kept = filtered.kept;
  if (options.maxRegions && kept.length > options.maxRegions) {
    discarded += kept.length - options.maxRegions;
    kept = kept.slice(0, options.maxRegions);
  }
  abort();

  return {
    regions: kept,
    stats: {
      polygons: kept.length,
      holes: kept.reduce((sum, region) => sum + region.holes.length, 0),
      discarded,
      invalid,
      elapsedMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started),
    },
  };
}

export { validateRegions };
