import type { ClassificationParams, ClassificationStats } from '../model/types';
import { DEFAULT_CLASSIFICATION_PARAMS } from '../model/constants';
import { correctIllumination } from './illumination';
import { computeFeatures } from './features';
import { slic } from './slic';
import { classifySignature, CLASS_DEFINITIONS, type ClassIndex } from './rules';
import { fillEnclosedHoles, labelAgreement, majorityFilter, removeSmallComponents } from './morphology';
import type { ClassPriorMap } from './types';

export {
  CLASS_ART,
  CLASS_COLORS,
  CLASS_OPEN,
  CLASS_UNC,
  CLASS_VEG,
  CLASS_WATER,
  CLASS_DEFINITIONS,
} from './rules';
export type { ClassIndex } from './rules';

export interface ClassificationResult {
  labels: Uint8Array;
  overlay: Uint8ClampedArray;
  /** Per-pixel confidence of the assigned class, 0..1. */
  confidence: Float32Array;
  stats: ClassificationStats;
  width: number;
  height: number;
}

export type ProgressFn = (percent: number, phase: string) => void;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalize(params: ClassificationParams): Required<ClassificationParams> {
  return { ...DEFAULT_CLASSIFICATION_PARAMS, ...params } as Required<ClassificationParams>;
}

/**
 * Integer reduction factor that caps the LONGEST side at maxSide. Using the
 * shortest side (or max/min) needlessly crushed panoramas: a 4000×300 image was
 * reduced 13× instead of 2×.
 */
export function workFactor(width: number, height: number, maxSide: number): number {
  const limit = Math.max(1, Math.floor(maxSide));
  return Math.max(1, Math.ceil(Math.max(width, height) / limit));
}

/** Working resolution for a source, derived from the same factor. */
export function workingSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number; factor: number } {
  const factor = workFactor(width, height, maxSide);
  return {
    factor,
    width: Math.max(1, Math.ceil(width / factor)),
    height: Math.max(1, Math.ceil(height / factor)),
  };
}

/**
 * Box-averaged downsample used to cap working memory on very large orthophotos.
 * Cells at the right/bottom edge average the pixels that actually exist, so no
 * source row or column is silently dropped.
 */
export function downsamplePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxSide: number,
): { pixels: Uint8ClampedArray; width: number; height: number } {
  const target = workingSize(width, height, maxSide);
  if (target.factor <= 1) return { pixels: rgba, width, height };
  const outWidth = target.width;
  const outHeight = target.height;
  const output = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    const sy = y * target.factor;
    const ey = Math.min(height, sy + target.factor);
    for (let x = 0; x < outWidth; x++) {
      const sx = x * target.factor;
      const ex = Math.min(width, sx + target.factor);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = sy; yy < ey; yy++) {
        const row = yy * width;
        for (let xx = sx; xx < ex; xx++) {
          const offset = (row + xx) * 4;
          r += rgba[offset];
          g += rgba[offset + 1];
          b += rgba[offset + 2];
          a += rgba[offset + 3];
          n++;
        }
      }
      const offset = (y * outWidth + x) * 4;
      const divisor = n || 1;
      output[offset] = r / divisor;
      output[offset + 1] = g / divisor;
      output[offset + 2] = b / divisor;
      output[offset + 3] = a / divisor;
    }
  }
  return { pixels: output, width: outWidth, height: outHeight };
}

export function classifyPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  params: ClassificationParams,
  onProgress?: ProgressFn,
  signal?: AbortSignal,
  prior?: ClassPriorMap | null,
): ClassificationResult {
  const settings = normalize(params);
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Classificazione annullata', 'AbortError');
  };

  onProgress?.(2, 'Riduzione di lavoro');
  const work = downsamplePixels(rgba, width, height, Math.max(256, settings.maxWorkSide));
  const w = work.width;
  const h = work.height;
  checkAbort();

  onProgress?.(12, 'Bilanciamento locale');
  const illuminated = correctIllumination(work.pixels, w, h, {
    tileSize: settings.tileSize,
    strength: settings.localBalance,
  });
  checkAbort();

  onProgress?.(26, 'Colore L*a*b* e texture');
  const features = computeFeatures(illuminated.pixels, w, h);
  checkAbort();

  onProgress?.(46, 'Segmentazione superpixel');
  const segments = slic(features, {
    superpixelSize: settings.superpixelSize,
    compactness: settings.slicCompactness,
    iterations: settings.slicIterations,
  });
  checkAbort();

  onProgress?.(64, 'Regole ISOM');
  const count = segments.count;
  const pixelCount = new Uint32Array(count);
  const sums = new Float64Array(count * 6);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pixel = y * w + x;
      const label = segments.labels[pixel];
      if (label < 0 || label >= count) continue;
      pixelCount[label]++;
      const base = label * 6;
      sums[base] += features.L[pixel];
      sums[base + 1] += features.a[pixel];
      sums[base + 2] += features.b[pixel];
      sums[base + 3] += features.variance[pixel];
      sums[base + 4] += features.lbp[pixel];
      sums[base + 5] += features.edge[pixel];
    }
  }

  // Aggregate the external prior per superpixel. A prior covering only a tiny
  // fraction of a segment must not steer the whole segment.
  const priorClass = new Uint8Array(count);
  const priorCoverage = new Float32Array(count);
  if (prior && prior.width === w && prior.height === h) {
    const priorSums = new Float32Array(count * 5);
    for (let pixel = 0; pixel < w * h; pixel++) {
      const strength = prior.strength[pixel];
      if (strength <= 0) continue;
      const label = segments.labels[pixel];
      if (label < 0 || label >= count) continue;
      priorSums[label * 5 + prior.classes[pixel]] += strength;
    }
    for (let label = 0; label < count; label++) {
      let bestClass = 0;
      let bestSum = 0;
      const base = label * 5;
      for (let classId = 1; classId < 5; classId++) {
        const sum = priorSums[base + classId];
        if (sum > bestSum) {
          bestSum = sum;
          bestClass = classId;
        }
      }
      if (bestSum > 0) {
        priorClass[label] = bestClass;
        priorCoverage[label] = pixelCount[label] ? bestSum / pixelCount[label] : 0;
      }
    }
  }

  const segmentClass = new Uint8Array(count);
  const segmentConfidence = new Float32Array(count);
  for (let label = 0; label < count; label++) {
    const size = pixelCount[label];
    if (!size) {
      segmentClass[label] = 0;
      segmentConfidence[label] = 0.2;
      continue;
    }
    const base = label * 6;
    const L = sums[base] / size;
    const a = sums[base + 1] / size;
    const b = sums[base + 2] / size;
    const chroma = Math.hypot(a, b);
    const decision = classifySignature(
      {
        L,
        a,
        b,
        sat: clamp01(chroma / 90),
        value: clamp01(L / 100),
        variance: sums[base + 3] / size,
        lbp: sums[base + 4] / size,
        edgeDensity: sums[base + 5] / size,
      },
      settings,
      priorCoverage[label] > 0.02
        ? { classId: priorClass[label] as ClassIndex, coverage: Math.min(1, priorCoverage[label]) }
        : null,
    );
    segmentClass[label] = decision.classId;
    segmentConfidence[label] = decision.confidence;
  }

  const labels = new Uint8Array(w * h);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const label = segments.labels[pixel];
    labels[pixel] = label >= 0 && label < count ? segmentClass[label] : 0;
  }
  checkAbort();

  onProgress?.(76, 'Pulizia morfologica');
  let cleaned = majorityFilter(labels, w, h, settings.majorityWindow);
  cleaned = removeSmallComponents(cleaned, w, h, settings.minComponentPx);
  if (settings.fillHoles) cleaned = fillEnclosedHoles(cleaned, w, h);
  checkAbort();

  onProgress?.(88, 'Confidenza e overlay');
  const agreement = labelAgreement(cleaned, w, h);
  const confidence = new Float32Array(w * h);
  const stats: ClassificationStats = { unc: 0, veg: 0, open: 0, water: 0, art: 0 };
  const keys: Array<keyof ClassificationStats> = ['unc', 'veg', 'open', 'water', 'art'];
  const counts = new Uint32Array(5);
  const overlay = new Uint8ClampedArray(w * h * 4);

  // Colour table flattened once: the old loop resolved an object property for
  // every one of the four million pixels.
  const reds = new Uint8Array(5);
  const greens = new Uint8Array(5);
  const blues = new Uint8Array(5);
  const alphas = new Uint8Array(5);
  for (let classId = 0; classId < 5; classId++) {
    const definition = CLASS_DEFINITIONS[classId as ClassIndex] ?? CLASS_DEFINITIONS[0];
    reds[classId] = definition.rgba[0];
    greens[classId] = definition.rgba[1];
    blues[classId] = definition.rgba[2];
    alphas[classId] = definition.rgba[3];
  }

  // Confidence, statistics and the overlay share one pass over the image.
  const illuminatedConfidence = illuminated.confidence;
  for (let pixel = 0; pixel < cleaned.length; pixel++) {
    const classId = cleaned[pixel] as ClassIndex;
    counts[classId]++;
    const offset = pixel * 4;
    overlay[offset] = reds[classId];
    overlay[offset + 1] = greens[classId];
    overlay[offset + 2] = blues[classId];
    overlay[offset + 3] = alphas[classId];

    const label = segments.labels[pixel];
    const valid = label >= 0 && label < count;
    const baseConfidence = valid ? segmentConfidence[label] : 0.2;
    const segmentLabel = valid ? segmentClass[label] : 0;
    // If the morphological pass rewrote this pixel, the final label was not the
    // classifier's own choice: report it with reduced confidence.
    const rewritten = classId !== segmentLabel ? 0.78 : 1;
    // Local label agreement and illumination quality both inform certainty.
    confidence[pixel] = clamp01(
      baseConfidence *
        rewritten *
        (0.78 + 0.22 * agreement[pixel]) *
        (0.85 + 0.15 * illuminatedConfidence[pixel]),
    );
  }

  keys.forEach((key, index) => {
    stats[key] = Math.round((counts[index] / cleaned.length) * 1000) / 10;
  });

  onProgress?.(100, 'Classificazione completata');
  return { labels: cleaned, overlay, confidence, stats, width: w, height: h };
}
