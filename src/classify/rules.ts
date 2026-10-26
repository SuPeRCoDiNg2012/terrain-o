import type { ClassificationParams } from '../model/types';

export type ClassIndex = 0 | 1 | 2 | 3 | 4;
export const CLASS_UNC = 0;
export const CLASS_VEG = 1;
export const CLASS_OPEN = 2;
export const CLASS_WATER = 3;
export const CLASS_ART = 4;

export interface ClassDefinition {
  id: ClassIndex;
  label: string;
  /** ISOM family, never a claim about ground truth. */
  family: 'Altro' | 'Vegetazione' | 'Aperto' | 'Acqua' | 'Antropico';
  css: string;
  rgba: [number, number, number, number];
  priority: number;
}

export const CLASS_DEFINITIONS: Record<ClassIndex, ClassDefinition> = {
  0: { id: 0, label: 'Zona incerta', family: 'Altro', css: '#a78bbf', rgba: [167, 139, 191, 52], priority: 0 },
  1: { id: 1, label: 'Possibile vegetazione', family: 'Vegetazione', css: '#3f8f4b', rgba: [63, 143, 75, 140], priority: 2 },
  2: { id: 2, label: 'Possibile terreno aperto', family: 'Aperto', css: '#c8a93c', rgba: [200, 169, 60, 120], priority: 1 },
  3: { id: 3, label: 'Possibile acqua', family: 'Acqua', css: '#3b82b8', rgba: [59, 130, 184, 150], priority: 3 },
  4: { id: 4, label: 'Superficie artificiale', family: 'Antropico', css: '#8e8e8e', rgba: [142, 142, 142, 110], priority: 1 },
};

export const CLASS_COLORS = Object.fromEntries(
  Object.entries(CLASS_DEFINITIONS).map(([key, value]) => [key, { css: value.css, rgba: value.rgba, label: value.label }]),
) as Record<ClassIndex, { css: string; rgba: [number, number, number, number]; label: string }>;

export interface SuperpixelSignature {
  /** Mean CIE L*. */
  L: number;
  a: number;
  b: number;
  sat: number;
  value: number;
  variance: number;
  /** 0 = uniform, 0.5 = random. */
  lbp: number;
  /** Fraction of pixels flagged as edges. */
  edgeDensity: number;
}

export interface RuleDecision {
  classId: ClassIndex;
  confidence: number;
  scores: Record<ClassIndex, number>;
}

/** External evidence for one superpixel, e.g. an OSM land-cover polygon. */
export interface PriorHint {
  classId: ClassIndex;
  /** Fraction of the superpixel covered by the prior, 0..1. */
  coverage: number;
}

const PRIORITY: Record<ClassIndex, number> = { 0: 0, 1: 2, 2: 1, 3: 3, 4: 1 };

function threshold(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Decision tree over mean superpixel features. Every branch is explainable from
 * the exposed L*a*b* thresholds and texture weights; there is no trained model
 * hiding the reason for a class.
 */
export function classifySignature(
  signature: SuperpixelSignature,
  params: ClassificationParams,
  prior?: PriorHint | null,
): RuleDecision {
  const waterBMax = threshold(params.waterBMax, -10);
  const vegAMax = threshold(params.vegAMax, -6);
  const openBMin = threshold(params.openBMin, 18);
  const artChromaMax = threshold(params.artChromaMax, 10);
  const textureWeight = clamp01(threshold(params.textureWeight, 0.35));
  const edgeWeight = clamp01(threshold(params.edgeWeight, 0.25));

  const { L, a, b, sat, variance, lbp, edgeDensity } = signature;
  // Below this lightness the sensor has almost no colour information: say
  // "unknown" instead of forcing a class onto shadow or burnt pixels.
  if (L < 12) {
    return { classId: 0, confidence: 0.38, scores: { 0: 0.9, 1: 0, 2: 0, 3: 0, 4: 0 } };
  }
  const chroma = Math.hypot(a, b);
  const texture = clamp01(lbp * 2.2);
  const edge = clamp01(edgeDensity * 3);
  const flat = clamp01(1 - Math.min(1, variance / 220));

  const scores: Record<ClassIndex, number> = { 0: 0.1, 1: 0, 2: 0, 3: 0, 4: 0 };

  // Water: blue-yellow axis strongly negative, uniform surface, not bright.
  if (b < waterBMax + 6) {
    scores[3] =
      clamp01((waterBMax + 6 - b) / 30) * 0.9 +
      flat * 0.35 +
      (1 - texture) * 0.15 -
      edge * 0.1;
  }

  // Vegetation: green-red axis negative; dense canopy adds texture, grass does not.
  if (a < vegAMax + 4) {
    scores[1] =
      clamp01((vegAMax + 4 - a) / 26) * 0.95 +
      texture * textureWeight * 0.5 +
      edge * edgeWeight * 0.25 +
      (L < 62 ? 0.1 : 0);
  }

  // Open ground: yellow axis positive, bright, low canopy texture.
  if (b > openBMin - 6 && L > 38) {
    scores[2] =
      clamp01((b - openBMin + 6) / 30) * 0.85 +
      flat * 0.25 +
      (1 - texture) * textureWeight * 0.3 -
      edge * edgeWeight * 0.15;
  }

  // Artificial: neutral chroma, mid/high lightness, straight edges help.
  if (chroma < artChromaMax + 5) {
    scores[4] =
      clamp01((artChromaMax + 5 - chroma) / (artChromaMax + 6)) * 0.85 +
      edge * edgeWeight * 0.35 +
      (L > 32 && L < 96 ? 0.12 : 0) -
      sat * 0.15;
  }

  // Very dark or saturated pixels with no clear family stay explicitly unknown.
  if (L < 12 || (sat > 0.72 && scores[1] < 0.25 && scores[3] < 0.25)) {
    scores[0] += 0.45;
  }

  // OSM is a prior, not an oracle. When the imagery is decisive the prior can
  // only break a near tie; when the imagery is ambiguous it may settle the
  // class. This keeps an outdated building footprint from overriding clear
  // water, while still using OSM to resolve genuinely uncertain surfaces.
  let priorApplied = false;
  if (prior && prior.classId !== 0 && prior.coverage > 0) {
    let initialBest = 0;
    for (const key of [3, 1, 4, 2, 0] as ClassIndex[]) {
      if (scores[key] > initialBest) initialBest = scores[key];
    }
    const weight = clamp01(threshold(params.osmPriorWeight, 0.55));
    const bonus = prior.coverage * weight * (initialBest >= 0.62 ? 0.2 : 0.7);
    scores[prior.classId] += bonus;
    priorApplied = bonus > 0;
  }

  let best: ClassIndex = 0;
  let bestScore = -Infinity;
  for (const key of [3, 1, 4, 2, 0] as ClassIndex[]) {
    const score = scores[key];
    if (score > bestScore + 0.001) {
      bestScore = score;
      best = key;
    } else if (Math.abs(score - bestScore) <= 0.001 && PRIORITY[key] > PRIORITY[best]) {
      best = key;
    }
  }

  if (bestScore < 0.22) {
    return { classId: 0, confidence: 0.36, scores };
  }

  const second = Math.max(...([0, 1, 2, 3, 4] as ClassIndex[]).filter((key) => key !== best).map((key) => scores[key]));
  const margin = clamp01((bestScore - second) / (bestScore + 0.15));
  let confidence = clamp01(0.5 + margin * 0.45 + (best === 0 ? -0.1 : 0));
  if (priorApplied && prior) {
    const agreement = best === prior.classId ? 1 : -1;
    confidence = clamp01(confidence + agreement * 0.06 * prior.coverage);
  }

  return { classId: best, confidence, scores };
}

/** Base class used by the vectorizer for a label id. */
export function classFamily(classId: number): ClassDefinition['family'] {
  return CLASS_DEFINITIONS[(classId as ClassIndex) ?? 0]?.family ?? 'Altro';
}
