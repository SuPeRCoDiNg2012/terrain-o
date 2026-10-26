import type { ClassificationParams } from '../model/types';
import { correctIllumination } from '../classify/illumination';
import { computeFeatures, type PixelFeatures } from '../classify/features';
import { slic, type SlicResult } from '../classify/slic';
import { classifySignature, type SuperpixelSignature } from '../classify/rules';
import {
  fillEnclosedHoles,
  majorityFilter,
  removeSmallComponents,
} from '../classify/morphology';
import {
  predictForest,
  topImportances,
  trainRandomForest,
  type RandomForest,
  type TrainingSample,
} from './forest';
import { detectTrees, type DetectedTree } from './trees';

/**
 * Local, explainable machine learning over superpixels.
 *
 * Labels come from OSM areas and manual geometry when available; high-confidence
 * rule decisions fill the gaps with a much lower weight. The output is always
 * experimental and only feeds the automatic symbol layer, never verification.
 */

export const AI_CLASS_COUNT = 6;
/** 0 unclassified, 1 vegetation, 2 open, 3 water, 4 artificial, 5 building. */
export const SUPERPIXEL_FEATURE_NAMES = [
  'L*',
  'a*',
  'b*',
  'chroma',
  'texture',
  'edge density',
  'edge strength',
  'segment area',
  'fill ratio',
  'aspect',
  'neighbour contrast',
  'local variance',
] as const;

export interface AiRecognitionOptions {
  pseudoLabels: boolean;
  detectTrees: boolean;
  treeSensitivity: number;
  maxTrees: number;
  majorityWindow: number;
  minComponentPx: number;
  minBuildingPx: number;
  fillHoles: boolean;
  seed: number;
}

export const DEFAULT_AI_OPTIONS: AiRecognitionOptions = {
  pseudoLabels: true,
  detectTrees: true,
  treeSensitivity: 0.65,
  maxTrees: 600,
  majorityWindow: 2,
  minComponentPx: 32,
  minBuildingPx: 36,
  fillHoles: true,
  seed: 1337,
};

export interface AiRecognitionInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  params: ClassificationParams;
  /** Class 1..5 at working resolution, 0 where there is no label. */
  trainLabels: Uint8Array;
  /** 0..N confidence of the training label at each pixel. */
  trainWeights: Float32Array;
  options?: Partial<AiRecognitionOptions>;
}

export interface AiRecognitionStats {
  samples: number;
  labelledSamples: number;
  pseudoSamples: number;
  validation: number;
  classes: number;
  trees: number;
  classPixels: Record<number, number>;
  featureImportance: Array<{ name: string; value: number }>;
}

export interface AiRecognitionOutput {
  labels: Uint8Array;
  confidence: Float32Array;
  width: number;
  height: number;
  trees: DetectedTree[];
  stats: AiRecognitionStats;
}

interface SegmentStats {
  count: number;
  L: number;
  a: number;
  b: number;
  variance: number;
  lbp: number;
  edge: number;
  edgeStrength: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  neighbourContrast: number;
  neighbourEdges: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function segmentFeatures(stats: SegmentStats): number[] {
  const count = Math.max(1, stats.count);
  const widthBox = Math.max(1, stats.maxX - stats.minX + 1);
  const heightBox = Math.max(1, stats.maxY - stats.minY + 1);
  const area = widthBox * heightBox;
  return [
    stats.L / count / 100,
    stats.a / count / 60,
    stats.b / count / 60,
    Math.hypot(stats.a / count, stats.b / count) / 60,
    Math.min(1, Math.log1p(stats.lbp / count) / 0.6),
    clamp01(stats.edge / count),
    Math.min(1, Math.log1p(stats.edgeStrength / count) / 6),
    Math.min(1, Math.log2(1 + count) / 12),
    clamp01(count / area),
    Math.min(widthBox, heightBox) / Math.max(widthBox, heightBox),
    Math.min(1, stats.neighbourContrast / Math.max(1, stats.neighbourEdges) / 30),
    Math.min(1, Math.sqrt(stats.variance / count) / 20),
  ];
}

function segmentSignature(stats: SegmentStats): SuperpixelSignature {
  const count = Math.max(1, stats.count);
  const a = stats.a / count;
  const b = stats.b / count;
  return {
    L: stats.L / count,
    a,
    b,
    sat: clamp01(Math.hypot(a, b) / 90),
    value: clamp01(stats.L / count / 100),
    variance: stats.variance / count,
    lbp: stats.lbp / count,
    edgeDensity: stats.edge / count,
  };
}

function aggregateSegments(
  features: PixelFeatures,
  segments: SlicResult,
  trainLabels: Uint8Array,
  trainWeights: Float32Array,
  checkAbort: () => void,
): {
  stats: SegmentStats[];
  classCounts: Float32Array;
  classWeights: Float32Array;
  labelledWeights: Float32Array;
} {
  const { width, height } = features;
  const count = segments.count;
  const stats: SegmentStats[] = Array.from({ length: count }, () => ({
    count: 0,
    L: 0,
    a: 0,
    b: 0,
    variance: 0,
    lbp: 0,
    edge: 0,
    edgeStrength: 0,
    minX: width,
    maxX: -1,
    minY: height,
    maxY: -1,
    neighbourContrast: 0,
    neighbourEdges: 0,
  }));
  const classCounts = new Float32Array(count * AI_CLASS_COUNT);
  const classWeights = new Float32Array(count * AI_CLASS_COUNT);

  for (let y = 0; y < height; y++) {
    if ((y & 63) === 0) checkAbort();
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const pixel = row + x;
      const label = segments.labels[pixel];
      if (label < 0 || label >= count) continue;
      const target = stats[label];
      target.count++;
      target.L += features.L[pixel];
      target.a += features.a[pixel];
      target.b += features.b[pixel];
      target.variance += features.variance[pixel];
      target.lbp += features.lbp[pixel];
      target.edge += features.edge[pixel];
      target.edgeStrength += features.edgeStrength[pixel];
      if (x < target.minX) target.minX = x;
      if (x > target.maxX) target.maxX = x;
      if (y < target.minY) target.minY = y;
      if (y > target.maxY) target.maxY = y;
      const train = trainLabels[pixel];
      if (train > 0 && train < AI_CLASS_COUNT) {
        classCounts[label * AI_CLASS_COUNT + train]++;
        classWeights[label * AI_CLASS_COUNT + train] += Math.max(0.01, trainWeights[pixel]);
      }
    }
  }

  const labelledWeights = new Float32Array(count);
  for (let label = 0; label < count; label++) {
    let total = 0;
    const base = label * AI_CLASS_COUNT;
    for (let classId = 1; classId < AI_CLASS_COUNT; classId++) total += classWeights[base + classId];
    labelledWeights[label] = total;
  }

  // Boundary contrast between adjacent superpixels. It separates a smooth roof
  // from a textured canopy without relying on absolute brightness.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const pixel = row + x;
      const label = segments.labels[pixel];
      if (label < 0 || label >= count) continue;
      if (x + 1 < width) {
        const neighbour = segments.labels[pixel + 1];
        if (neighbour !== label) {
          const contrast = Math.abs(features.L[pixel] - features.L[pixel + 1]);
          stats[label].neighbourContrast += contrast;
          stats[label].neighbourEdges++;
          if (neighbour >= 0 && neighbour < count) {
            stats[neighbour].neighbourContrast += contrast;
            stats[neighbour].neighbourEdges++;
          }
        }
      }
      if (y + 1 < height) {
        const neighbour = segments.labels[pixel + width];
        if (neighbour !== label) {
          const contrast = Math.abs(features.L[pixel] - features.L[pixel + width]);
          stats[label].neighbourContrast += contrast;
          stats[label].neighbourEdges++;
          if (neighbour >= 0 && neighbour < count) {
            stats[neighbour].neighbourContrast += contrast;
            stats[neighbour].neighbourEdges++;
          }
        }
      }
    }
  }

  return { stats, classCounts, classWeights, labelledWeights };
}

function capSamples(samples: TrainingSample[], perClass: number): TrainingSample[] {
  const groups = new Map<number, TrainingSample[]>();
  for (const sample of samples) {
    const list = groups.get(sample.label);
    if (list) list.push(sample);
    else groups.set(sample.label, [sample]);
  }
  const result: TrainingSample[] = [];
  for (const list of groups.values()) {
    if (list.length <= perClass) {
      result.push(...list);
      continue;
    }
    const stride = list.length / perClass;
    for (let index = 0; index < perClass; index++) {
      result.push(list[Math.floor(index * stride)]);
    }
  }
  return result;
}

function validationAccuracy(
  samples: TrainingSample[],
  options: AiRecognitionOptions,
): { accuracy: number; train: TrainingSample[]; validate: TrainingSample[] } {
  const groups = new Map<number, TrainingSample[]>();
  for (const sample of samples) {
    const list = groups.get(sample.label);
    if (list) list.push(sample);
    else groups.set(sample.label, [sample]);
  }
  const train: TrainingSample[] = [];
  const validate: TrainingSample[] = [];
  for (const list of groups.values()) {
    const holdout = list.length >= 8 ? Math.max(1, Math.round(list.length * 0.2)) : 0;
    for (let index = 0; index < list.length; index++) {
      if (holdout && index % Math.max(1, Math.round(list.length / holdout)) === 0) validate.push(list[index]);
      else train.push(list[index]);
    }
  }
  if (!train.length || !validate.length) return { accuracy: 0, train, validate };
  const forest = trainRandomForest(train, {
    classCount: AI_CLASS_COUNT,
    seed: options.seed,
    trees: 20,
    maxDepth: 9,
  });
  let correct = 0;
  let total = 0;
  for (const sample of validate) {
    const probabilities = predictForest(forest, sample.features);
    let best = 0;
    for (let classId = 1; classId < probabilities.length; classId++) {
      if (probabilities[classId] > probabilities[best]) best = classId;
    }
    total += sample.weight;
    if (best === sample.label) correct += sample.weight;
  }
  return { accuracy: total > 0 ? (correct / total) * 100 : 0, train, validate };
}

function shrinkBuildingSpecks(
  labels: Uint8Array,
  width: number,
  height: number,
  minPixels: number,
): void {
  if (minPixels <= 1) return;
  const total = labels.length;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (visited[start] || labels[start] !== 5) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index / width) | 0;
      if (x > 0) {
        const next = index - 1;
        if (!visited[next] && labels[next] === 5) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (x < width - 1) {
        const next = index + 1;
        if (!visited[next] && labels[next] === 5) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y > 0) {
        const next = index - width;
        if (!visited[next] && labels[next] === 5) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y < height - 1) {
        const next = index + width;
        if (!visited[next] && labels[next] === 5) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (tail < minPixels) {
      for (let index = 0; index < tail; index++) labels[queue[index]] = 4;
    }
  }
}

export function recognizeSymbols(
  input: AiRecognitionInput,
  callbacks: {
    onProgress?: (percent: number, phase: string) => void;
    signal?: AbortSignal;
  } = {},
): AiRecognitionOutput {
  const options: AiRecognitionOptions = { ...DEFAULT_AI_OPTIONS, ...input.options };
  const { width, height } = input;
  const checkAbort = () => {
    if (callbacks.signal?.aborted) throw new DOMException('Riconoscimento annullato', 'AbortError');
  };
  if (input.rgba.length !== width * height * 4) {
    throw new Error('Immagine non coerente con la dimensione dichiarata.');
  }
  if (input.trainLabels.length !== width * height || input.trainWeights.length !== width * height) {
    throw new Error('Etichette di addestramento non coerenti con la dimensione di lavoro.');
  }

  callbacks.onProgress?.(4, 'Bilanciamento locale');
  const illuminated = correctIllumination(input.rgba, width, height, {
    tileSize: input.params.tileSize ?? 64,
    strength: input.params.localBalance ?? 0.85,
  });
  checkAbort();

  callbacks.onProgress?.(18, 'Colore e texture');
  const features = computeFeatures(illuminated.pixels, width, height);
  checkAbort();

  callbacks.onProgress?.(36, 'Segmentazione superpixel');
  const segments = slic(features, {
    superpixelSize: input.params.superpixelSize ?? 24,
    compactness: input.params.slicCompactness ?? 12,
    iterations: input.params.slicIterations ?? 4,
  });
  checkAbort();

  callbacks.onProgress?.(50, 'Campioni di addestramento');
  const aggregate = aggregateSegments(
    features,
    segments,
    input.trainLabels,
    input.trainWeights,
    checkAbort,
  );
  const featureVectors: number[][] = aggregate.stats.map(segmentFeatures);
  const signatures: SuperpixelSignature[] = aggregate.stats.map(segmentSignature);

  const real: TrainingSample[] = [];
  const pseudo: TrainingSample[] = [];
  const labelledThreshold = 0.45;
  for (let label = 0; label < segments.count; label++) {
    const count = aggregate.stats[label].count;
    if (count < 3) continue;
    const base = label * AI_CLASS_COUNT;
    let bestClass = 0;
    let bestCount = 0;
    for (let classId = 1; classId < AI_CLASS_COUNT; classId++) {
      const value = aggregate.classCounts[base + classId];
      if (value > bestCount) {
        bestCount = value;
        bestClass = classId;
      }
    }
    const coverage = bestCount / count;
    if (bestClass > 0 && coverage >= labelledThreshold) {
      const averageWeight = aggregate.classWeights[base + bestClass] / Math.max(1, bestCount);
      real.push({
        features: featureVectors[label],
        label: bestClass,
        weight: Math.max(0.15, averageWeight) * Math.min(1, coverage + 0.15),
      });
      continue;
    }
    if (!options.pseudoLabels) continue;
    const decision = classifySignature(signatures[label], input.params);
    if (decision.classId === 0) continue;
    const threshold = real.length >= 40 ? 0.78 : 0.58;
    if (decision.confidence < threshold) continue;
    pseudo.push({
      features: featureVectors[label],
      label: decision.classId,
      weight: real.length >= 40 ? 0.22 : 0.45,
    });
  }

  const labelledSamples = real.length;
  const pseudoSamples = pseudo.length;
  let samples = [...real, ...pseudo];
  // Merge duplicate labels for the same segment? A segment either contributed
  // a real sample or a pseudo one, never both, so every entry is distinct.
  samples = capSamples(samples, 1200);

  const distinct = new Set(samples.map((sample) => sample.label));
  if (samples.length < 6) {
    throw new Error(
      'Servono più esempi: importa OSM o disegna alcune aree manuali (bosco, acqua, edificio). In alternativa attiva le pseudo-etichette.',
    );
  }
  if (distinct.size < 2) {
    throw new Error(
      'Il modello vede una sola classe. Aggiungi esempi di altre classi (OSM o aree manuali) oppure attiva le pseudo-etichette.',
    );
  }

  checkAbort();
  callbacks.onProgress?.(62, 'Addestramento del modello');
  const validation = validationAccuracy(samples, options);
  const forest: RandomForest = trainRandomForest(samples, {
    classCount: AI_CLASS_COUNT,
    seed: options.seed,
    trees: 28,
    maxDepth: 10,
  });

  callbacks.onProgress?.(76, 'Classificazione dei superpixel');
  const segmentClass = new Uint8Array(segments.count);
  const segmentConfidence = new Float32Array(segments.count);
  for (let label = 0; label < segments.count; label++) {
    checkAbort();
    const probabilities = predictForest(forest, featureVectors[label]);
    let best = 0;
    for (let classId = 1; classId < probabilities.length; classId++) {
      if (probabilities[classId] > probabilities[best]) best = classId;
    }
    const confidence = probabilities[best];
    if (confidence < 0.3) {
      segmentClass[label] = 0;
      segmentConfidence[label] = 0.2;
    } else {
      segmentClass[label] = best;
      segmentConfidence[label] = confidence;
    }
  }

  const labels = new Uint8Array(width * height);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const label = segments.labels[pixel];
    labels[pixel] = label >= 0 && label < segments.count ? segmentClass[label] : 0;
  }
  checkAbort();

  callbacks.onProgress?.(88, 'Pulizia morfologica');
  let cleaned = majorityFilter(labels, width, height, options.majorityWindow, AI_CLASS_COUNT);
  cleaned = removeSmallComponents(cleaned, width, height, options.minComponentPx);
  if (options.fillHoles) cleaned = fillEnclosedHoles(cleaned, width, height, AI_CLASS_COUNT);
  shrinkBuildingSpecks(cleaned, width, height, options.minBuildingPx);
  checkAbort();

  const confidence = new Float32Array(width * height);
  const classPixels: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let pixel = 0; pixel < cleaned.length; pixel++) {
    const classId = cleaned[pixel];
    classPixels[classId] = (classPixels[classId] ?? 0) + 1;
    const label = segments.labels[pixel];
    const base = label >= 0 && label < segments.count ? segmentConfidence[label] : 0.2;
    const original = label >= 0 && label < segments.count ? segmentClass[label] : 0;
    confidence[pixel] = classId === 0 ? 0.15 : base * (classId === original ? 1 : 0.8);
  }

  const trees = options.detectTrees
    ? detectTrees({
        width,
        height,
        labels: cleaned,
        L: features.L,
        variance: features.variance,
        sensitivity: options.treeSensitivity,
        minSpacing: Math.max(6, Math.round((input.params.superpixelSize ?? 24) * 0.35)),
        maxTrees: options.maxTrees,
      })
    : [];

  const importances = topImportances(forest, [...SUPERPIXEL_FEATURE_NAMES], 5);
  callbacks.onProgress?.(100, 'Riconoscimento completato');
  return {
    labels: cleaned,
    confidence,
    width,
    height,
    trees,
    stats: {
      samples: samples.length,
      labelledSamples,
      pseudoSamples,
      validation: Math.round(validation.accuracy * 10) / 10,
      classes: distinct.size,
      trees: trees.length,
      classPixels,
      featureImportance: importances,
    },
  };
}
