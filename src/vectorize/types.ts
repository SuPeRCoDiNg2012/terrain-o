import type { Point } from '../model/types';

export interface VectorizeOptions {
  /** Douglas-Peucker tolerance in working pixels. */
  simplifyTolerance: number;
  /** Chaikin pre-smoothing iterations, 0–3. */
  smoothIterations: number;
  /** Minimum polygon area in square working pixels. */
  minAreaPx: number;
  /** Minimum hole area in square working pixels. */
  minHoleAreaPx: number;
  /**
   * 0–1 confidence required to keep a pixel. This is a floor for pixels the
   * classifier barely assigned, not a quality filter: a class the rules decided
   * with moderate confidence is still map content, and cutting it out punches
   * holes between polygons. The explicit "unknown" class is what marks
   * genuinely undecided ground.
   */
  confidenceThreshold: number;
  /** Prefer the most specific class when two classes compete. */
  hierarchyPriority: boolean;
  /** Snap shared boundaries between adjacent regions. */
  reconcileEdges: boolean;
  /** Label ids to vectorize (classification codes). */
  categories: number[];
  /** Fill enclosed holes below the hole threshold. */
  fillHoles?: boolean;
  /** Abort after this many polygons, mostly for previews. */
  maxRegions?: number;
}

export const DEFAULT_VECTORIZE_OPTIONS: VectorizeOptions = {
  simplifyTolerance: 1.5,
  smoothIterations: 2,
  minAreaPx: 100,
  minHoleAreaPx: 20,
  confidenceThreshold: 0.45,
  hierarchyPriority: true,
  reconcileEdges: true,
  categories: [1, 2, 3, 4],
  fillHoles: true,
};

export interface PolygonalRegion {
  /** Feature type key from AREA_TYPES, e.g. "forest". */
  featureType: string;
  /** Outer ring in working-pixel coordinates. */
  coords: Point[];
  /** Inner rings in working-pixel coordinates. */
  holes: Point[][];
  /** Geometry area in square pixels. */
  area: number;
  /** Classification label id. */
  classId: number;
  /** Mean classifier confidence, 0–1. */
  confidence: number;
}

export interface VectorizeStats {
  polygons: number;
  holes: number;
  discarded: number;
  /** Discarded because the topology check failed. */
  invalid: number;
  /** Working milliseconds, measured by the pipeline. */
  elapsedMs: number;
}

export interface VectorizeInput {
  labels: Uint8Array;
  width: number;
  height: number;
  /** Optional per-pixel confidence, same length as labels. */
  confidence?: Float32Array | null;
  classes?: number[];
  /**
   * Optional per-class claim maps (0–255) for probabilistic classifiers that
   * produce one mask per class instead of a single label map. Overlaps are
   * resolved with the confidence and the ISOM specificity rule.
   */
  claims?: Map<number, Uint8Array> | null;
}

export interface VectorizeResult {
  regions: PolygonalRegion[];
  stats: VectorizeStats;
}
