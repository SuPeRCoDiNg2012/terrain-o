import { describe, expect, it } from 'vitest';
import {
  predictForest,
  topImportances,
  trainRandomForest,
  type TrainingSample,
} from './forest';

function separable(count: number): TrainingSample[] {
  const samples: TrainingSample[] = [];
  for (let index = 0; index < count; index++) {
    const t = index / count;
    const noise = Math.sin(index * 12.9898) * 0.04;
    const x = t + noise;
    const y = Math.cos(index * 7.233) * 0.5;
    // Class 0 for x < 0.5, class 1 above, with an irrelevant y feature.
    samples.push({ features: [x, y, Math.abs(y)], label: x < 0.5 ? 0 : 1, weight: 1 });
  }
  return samples;
}

describe('random forest', () => {
  it('learns a separable boundary and averages probabilities to one', () => {
    const forest = trainRandomForest(separable(240), {
      classCount: 2,
      trees: 16,
      seed: 7,
      maxDepth: 6,
      minLeafSamples: 3,
    });
    let correct = 0;
    let total = 0;
    for (let index = 0; index < 120; index++) {
      const x = index / 120;
      const probabilities = predictForest(forest, [x, 0.1, 0.1]);
      expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
      const predicted = probabilities[0] > probabilities[1] ? 0 : 1;
      if (predicted === (x < 0.5 ? 0 : 1)) correct++;
      total++;
    }
    expect(correct / total).toBeGreaterThan(0.95);
    expect(topImportances(forest, ['x', 'y', 'abs-y'], 1)[0].name).toBe('x');
  });

  it('is deterministic for the same seed and exposes valid importances', () => {
    const samples = separable(180);
    const a = trainRandomForest(samples, { classCount: 2, trees: 10, seed: 42 });
    const b = trainRandomForest(samples, { classCount: 2, trees: 10, seed: 42 });
    const probe = [0.62, 0.2, 0.2];
    expect(predictForest(a, probe)).toEqual(predictForest(b, probe));
    const sum = a.importances.reduce((total, value) => total + value, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(a.importances.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('handles a single-class training set without dividing by zero', () => {
    const samples: TrainingSample[] = Array.from({ length: 20 }, (_, index) => ({
      features: [index / 20, 0],
      label: 0,
      weight: 1,
    }));
    const forest = trainRandomForest(samples, { classCount: 2, trees: 5, seed: 3 });
    const probabilities = predictForest(forest, [0.5, 0]);
    expect(probabilities[0]).toBeCloseTo(1, 6);
    expect(probabilities[1]).toBeCloseTo(0, 6);
  });

  it('rejects an empty training set', () => {
    expect(() => trainRandomForest([], { classCount: 2 })).toThrow(/Nessun campione/);
  });
});
