import { describe, expect, it } from 'vitest';
import { computePriorAgreement } from './priorAgreement';
import type { ClassPriorMap } from './types';

function prior(classes: number[], strength: number[]): ClassPriorMap {
  return {
    width: 4,
    height: 4,
    classes: new Uint8Array(classes),
    strength: new Float32Array(strength),
  };
}

const LABELS = new Uint8Array([
  1, 1, 3, 3,
  1, 2, 3, 4,
  0, 0, 0, 0,
  4, 4, 4, 4,
]);

const CLASSES = [
  1, 1, 3, 4,
  1, 2, 3, 4,
  1, 2, 3, 4,
  4, 4, 4, 4,
];

const STRENGTH = new Array(16).fill(0.9);

describe('OSM/classification agreement', () => {
  it('reports overall, coverage and per-class agreement', () => {
    const report = computePriorAgreement(LABELS, prior(CLASSES, STRENGTH));
    expect(report.priorPixels).toBe(16);
    expect(report.covered).toBe(100);
    expect(report.overall).toBeCloseTo(68.8, 1);
    expect(report.byClass.veg).toBeCloseTo(75, 1);
    expect(report.byClass.open).toBeCloseTo(50, 1);
    expect(report.byClass.water).toBeCloseTo(66.7, 1);
    expect(report.byClass.art).toBeCloseTo(71.4, 1);
    expect(report.classPixels).toEqual({ veg: 4, open: 2, water: 3, art: 7 });
  });

  it('ignores thin or weak priors below the strength threshold', () => {
    const weak = STRENGTH.slice();
    weak[3] = 0.1;
    const report = computePriorAgreement(LABELS, prior(CLASSES, weak));
    expect(report.priorPixels).toBe(15);
    expect(report.covered).toBeCloseTo(93.8, 1);
    expect(report.overall).toBeCloseTo(73.3, 1);
    expect(report.classPixels.art).toBe(6);
  });

  it('returns an empty report when dimensions do not match', () => {
    const mismatched = prior(CLASSES, STRENGTH);
    mismatched.width = 2;
    mismatched.height = 2;
    const report = computePriorAgreement(LABELS, mismatched);
    expect(report).toMatchObject({ overall: 0, covered: 0, priorPixels: 0 });
    expect(report.classPixels).toEqual({ veg: 0, open: 0, water: 0, art: 0 });
  });
});
