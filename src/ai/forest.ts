import { mulberry32 } from './random';

/**
 * A small, deterministic random forest over superpixel features.
 *
 * It is deliberately implemented here instead of pulling a black-box library:
 * the model must stay inspectable, run offline in a worker and expose feature
 * importances to the tuning panel. Forest outputs are probabilities, never a
 * statement about the ground.
 */

export interface TrainingSample {
  features: number[];
  /** 0..classCount-1. */
  label: number;
  /** Relative importance of the sample; manual labels weigh more than rules. */
  weight: number;
}

export interface ForestOptions {
  classCount: number;
  trees: number;
  maxDepth: number;
  /** Minimum number of samples on each side of a split. */
  minLeafSamples: number;
  /** Features tried per split; 0 means sqrt(featureCount). */
  maxFeatures: number;
  /** Candidate thresholds evaluated for each feature at a split. */
  thresholdsPerFeature: number;
  seed: number;
}

export const DEFAULT_FOREST_OPTIONS: Omit<ForestOptions, 'classCount' | 'seed'> = {
  trees: 28,
  maxDepth: 10,
  minLeafSamples: 4,
  maxFeatures: 0,
  thresholdsPerFeature: 10,
};

export interface ForestNode {
  feature?: number;
  threshold?: number;
  left?: ForestNode;
  right?: ForestNode;
  probabilities?: number[];
}

export interface RandomForest {
  classCount: number;
  featureCount: number;
  trees: ForestNode[];
  importances: number[];
  options: ForestOptions;
}

function leafFromCounts(counts: Float64Array): ForestNode {
  let total = 0;
  for (let index = 0; index < counts.length; index++) total += counts[index];
  const probabilities = new Array<number>(counts.length);
  for (let index = 0; index < counts.length; index++) {
    probabilities[index] = total > 0 ? counts[index] / total : 0;
  }
  return { probabilities };
}

function gini(counts: Float64Array, total: number): number {
  if (total <= 0) return 0;
  let sum = 0;
  for (let index = 0; index < counts.length; index++) {
    const share = counts[index] / total;
    sum += share * share;
  }
  return 1 - sum;
}

interface Split {
  feature: number;
  threshold: number;
  gain: number;
  left: number[];
  right: number[];
}

function bestSplit(
  indices: number[],
  x: number[][],
  labels: number[],
  weights: number[],
  options: ForestOptions,
  random: () => number,
): Split | null {
  const featureCount = x[0]?.length ?? 0;
  if (!featureCount || indices.length < options.minLeafSamples * 2) return null;
  const classCount = options.classCount;
  const parent = new Float64Array(classCount);
  let totalWeight = 0;
  for (const index of indices) {
    parent[labels[index]] += weights[index];
    totalWeight += weights[index];
  }
  if (totalWeight <= 0) return null;
  const parentGini = gini(parent, totalWeight);

  const wanted = options.maxFeatures > 0 ? options.maxFeatures : Math.max(1, Math.round(Math.sqrt(featureCount)));
  const tried = Math.min(featureCount, wanted);
  const features: number[] = [];
  const pool = Array.from({ length: featureCount }, (_, index) => index);
  for (let index = 0; index < tried; index++) {
    const pick = index + Math.floor(random() * (pool.length - index));
    const value = pool[pick];
    pool[pick] = pool[index];
    pool[index] = value;
    features.push(value);
  }

  let best: Split | null = null;
  for (const feature of features) {
    let min = Infinity;
    let max = -Infinity;
    for (const index of indices) {
      const value = x[index][feature];
      if (!Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!(max > min)) continue;
    for (let attempt = 0; attempt < options.thresholdsPerFeature; attempt++) {
      const threshold = min + (max - min) * (0.08 + 0.84 * random());
      const leftCounts = new Float64Array(classCount);
      const rightCounts = new Float64Array(classCount);
      let leftWeight = 0;
      let rightWeight = 0;
      let leftSize = 0;
      let rightSize = 0;
      for (const index of indices) {
        const weight = weights[index];
        if (x[index][feature] <= threshold) {
          leftCounts[labels[index]] += weight;
          leftWeight += weight;
          leftSize++;
        } else {
          rightCounts[labels[index]] += weight;
          rightWeight += weight;
          rightSize++;
        }
      }
      if (leftSize < options.minLeafSamples || rightSize < options.minLeafSamples) continue;
      if (leftWeight <= 0 || rightWeight <= 0) continue;
      const gain =
        parentGini -
        (leftWeight / totalWeight) * gini(leftCounts, leftWeight) -
        (rightWeight / totalWeight) * gini(rightCounts, rightWeight);
      if (gain <= 1e-9) continue;
      if (!best || gain > best.gain) {
        const left: number[] = [];
        const right: number[] = [];
        for (const index of indices) {
          if (x[index][feature] <= threshold) left.push(index);
          else right.push(index);
        }
        best = { feature, threshold, gain, left, right };
      }
    }
  }
  return best;
}

function buildNode(
  indices: number[],
  depth: number,
  x: number[][],
  labels: number[],
  weights: number[],
  options: ForestOptions,
  random: () => number,
  importances: number[],
): ForestNode {
  const classCount = options.classCount;
  const counts = new Float64Array(classCount);
  let totalWeight = 0;
  for (const index of indices) {
    counts[labels[index]] += weights[index];
    totalWeight += weights[index];
  }
  if (indices.length === 0 || totalWeight <= 0) {
    return { probabilities: new Array<number>(classCount).fill(1 / classCount) };
  }

  let distinct = 0;
  for (let index = 0; index < classCount; index++) if (counts[index] > 0) distinct++;
  if (depth >= options.maxDepth || indices.length < options.minLeafSamples * 2 || distinct <= 1) {
    return leafFromCounts(counts);
  }

  const split = bestSplit(indices, x, labels, weights, options, random);
  if (!split) return leafFromCounts(counts);

  importances[split.feature] += split.gain * totalWeight;
  return {
    feature: split.feature,
    threshold: split.threshold,
    left: buildNode(split.left, depth + 1, x, labels, weights, options, random, importances),
    right: buildNode(split.right, depth + 1, x, labels, weights, options, random, importances),
  };
}

export function trainRandomForest(samples: TrainingSample[], partial: Partial<ForestOptions> = {}): RandomForest {
  if (!samples.length) throw new Error('Nessun campione per addestrare il modello.');
  const maxLabel = samples.reduce((max, sample) => Math.max(max, sample.label), 0);
  const classCount = Math.max(partial.classCount ?? 0, maxLabel + 1, 2);
  const options: ForestOptions = {
    ...DEFAULT_FOREST_OPTIONS,
    ...partial,
    classCount,
    seed: partial.seed ?? 1,
  };
  if (options.trees < 1) options.trees = 1;
  if (options.maxDepth < 1) options.maxDepth = 1;
  options.minLeafSamples = Math.max(1, Math.round(options.minLeafSamples));

  const x = samples.map((sample) => sample.features);
  const labels = samples.map((sample) => sample.label);
  const weights = samples.map((sample) => Math.max(0, sample.weight) || 1e-6);
  const importances = new Array<number>(x[0]?.length ?? 0).fill(0);
  const random = mulberry32(options.seed);
  const trees: ForestNode[] = [];

  for (let tree = 0; tree < options.trees; tree++) {
    const indices: number[] = [];
    for (let index = 0; index < samples.length; index++) {
      indices.push(Math.floor(random() * samples.length));
    }
    trees.push(buildNode(indices, 0, x, labels, weights, options, random, importances));
  }

  const totalImportance = importances.reduce((sum, value) => sum + value, 0);
  if (totalImportance > 0) {
    for (let index = 0; index < importances.length; index++) importances[index] /= totalImportance;
  }

  return {
    classCount,
    featureCount: x[0]?.length ?? 0,
    trees,
    importances,
    options,
  };
}

function predictNode(node: ForestNode, features: number[]): number[] {
  let current = node;
  while (current.probabilities == null) {
    const value = features[current.feature ?? 0];
    current = value <= (current.threshold ?? 0) ? current.left! : current.right!;
  }
  return current.probabilities;
}

/** Class probabilities, averaged over every tree. */
export function predictForest(forest: RandomForest, features: number[]): number[] {
  const totals = new Array<number>(forest.classCount).fill(0);
  for (const tree of forest.trees) {
    const probabilities = predictNode(tree, features);
    for (let index = 0; index < forest.classCount; index++) totals[index] += probabilities[index] ?? 0;
  }
  const count = Math.max(1, forest.trees.length);
  for (let index = 0; index < totals.length; index++) totals[index] /= count;
  return totals;
}

export interface Importance {
  name: string;
  value: number;
}

export function topImportances(
  forest: RandomForest,
  names: string[],
  count = 5,
): Importance[] {
  return forest.importances
    .map((value, index) => ({ name: names[index] ?? `f${index}`, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}
