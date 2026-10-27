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
  // CIE hue angle. Sector 130–190° is green (canopy), 70–125° is yellow/olive
  // (grass, dry meadow), 220–300° is blue. Hue survives exposure changes far
  // better than the raw a* axis: shadowed meadow has a* ≈ −11, which looks
  // "green" on that axis alone even though it is yellow-green ground.
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
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

  // Vegetation: green hue and a green-red axis that leans green. Dense canopy
  // adds texture, mown grass does not.
  if (a < vegAMax + 4 && hue >= 118 && hue <= 200) {
    const greenness = clamp01((vegAMax + 4 - a) / 26);
    const hueFit = clamp01((hue - 118) / 14) * clamp01((200 - hue) / 20);
    scores[1] =
      greenness * 0.72 +
      hueFit * 0.2 +
      texture * textureWeight * 0.5 +
      edge * edgeWeight * 0.25 +
      (L < 62 ? 0.1 : 0);
  }

  // Open ground: warm yellow/olive hue, positive yellow axis, low canopy
  // texture. Lightness is a soft factor rather than a gate: shadowed meadow at
  // L ≈ 33 is still meadow, and the old L > 38 gate sent it to vegetation.
  if (b > openBMin - 8 && hue >= 78 && hue <= 130) {
    const warmth = clamp01((b - (openBMin - 8)) / 26) * 0.7;
    const hueFit = clamp01(1 - Math.abs(hue - 100) / 30) * 0.22;
    const lightness = clamp01((L - 18) / 22);
    scores[2] =
      warmth * lightness +
      hueFit * lightness +
      flat * 0.22 +
      (1 - texture) * textureWeight * 0.28 -
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

  // Built surfaces are not always grey: tile and metal roofs are warm ochre,
  // terracotta or dull red. They are smooth (low variance) and sit in the
  // orange/red hue sector, unlike yellow meadow, which is flat too but sits at
  // 100–120°. Without this branch a roof fell through every family and came out
  // as open ground or unknown.
  if (hue > 5 && hue < 88 && chroma >= artChromaMax - 3 && chroma < 52 && flat > 0.5 && L > 28) {
    scores[4] = Math.max(scores[4], 0.42 + flat * 0.2 + edge * edgeWeight * 0.25);
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
  // Confidence combines how strong the winning evidence is with how far it is
  // from the runner-up. A rule score of 0.55 against 0.50 (open ground next to
  // asphalt, which genuinely look alike) used to report 0.53, and the vectorizer
  // then deleted those pixels from every mask. Evidence and separation are now
  // both counted, so "clear but low-contrast" is not mistaken for "unknown".
  const separation = clamp01((bestScore - second) / Math.max(0.2, bestScore));
  let confidence = clamp01(0.42 + 0.28 * clamp01(bestScore) + 0.34 * separation);
  if (best === 0) confidence = Math.min(confidence, 0.4);
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
