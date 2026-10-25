import { describe, expect, it } from 'vitest';
import { rgbToLab, rgbToHsv, labToRgb } from './colorSpace';
import { correctIllumination } from './illumination';
import { slic } from './slic';
import { computeFeatures } from './features';
import { classifySignature, CLASS_ART, CLASS_OPEN, CLASS_UNC, CLASS_VEG, CLASS_WATER } from './rules';
import { fillEnclosedHoles, majorityFilter, removeSmallComponents } from './morphology';
import { classifyPixels } from './classify';
import { DEFAULT_CLASSIFICATION_PARAMS } from '../model/constants';

function synthetic(
  width: number,
  height: number,
  painter: (x: number, y: number) => [number, number, number],
  shade: (x: number, y: number) => number = () => 1,
  noise = 0,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 1234567;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = painter(x, y);
      const factor = shade(x, y);
      const offset = (y * width + x) * 4;
      const jitter = () => (random() - 0.5) * 2 * noise;
      data[offset] = Math.max(0, Math.min(255, r * factor + jitter()));
      data[offset + 1] = Math.max(0, Math.min(255, g * factor + jitter()));
      data[offset + 2] = Math.max(0, Math.min(255, b * factor + jitter()));
      data[offset + 3] = 255;
    }
  }
  return data;
}

describe('colour spaces', () => {
  it('converts white and black to expected Lab lightness', () => {
    const white = rgbToLab(255, 255, 255);
    const black = rgbToLab(0, 0, 0);
    expect(white.L).toBeCloseTo(100, 1);
    expect(Math.abs(white.a)).toBeLessThan(0.1);
    expect(Math.abs(white.b)).toBeLessThan(0.1);
    expect(black.L).toBeCloseTo(0, 1);
  });

  it('round-trips a saturated colour', () => {
    const [r, g, b] = labToRgb(...Object.values(rgbToLab(40, 120, 190)) as [number, number, number]);
    expect(Math.abs(r - 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 120)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 190)).toBeLessThanOrEqual(2);
  });

  it('reports HSV hue and saturation', () => {
    const hsv = rgbToHsv(0, 0, 255);
    expect(hsv.h).toBeCloseTo(240, 0);
    expect(hsv.s).toBeCloseTo(1, 2);
  });
});

describe('local illumination', () => {
  it('balances a strong luminance gradient without desaturating colour', () => {
    const width = 128;
    const height = 64;
    const pixels = synthetic(width, height, () => [42, 96, 44], (x) => 0.6 + (x / width) * 0.7, 2);
    const before = computeFeatures(pixels, width, height);
    const leftChroma = Math.hypot(before.a[10 * width + 10], before.b[10 * width + 10]);
    const result = correctIllumination(pixels, width, height, { tileSize: 64, strength: 1 });
    const after = computeFeatures(result.pixels, width, height);
    const leftAfter = after.L[10 * width + 10];
    const rightAfter = after.L[10 * width + width - 11];
    const rightChroma = Math.hypot(after.a[10 * width + width - 11], after.b[10 * width + width - 11]);
    const leftSaturation = leftChroma / (leftAfter + 10);
    const rightSaturation = rightChroma / (rightAfter + 10);
    expect(Math.abs(leftAfter - rightAfter)).toBeLessThan(14);
    expect(Math.abs(leftSaturation - rightSaturation)).toBeLessThan(0.16);
    expect(leftChroma).toBeGreaterThan(10);
  });
});

describe('SLIC superpixels', () => {
  it('segments two flat colour halves', () => {
    const width = 64;
    const height = 64;
    const pixels = synthetic(width, height, (x) => (x < width / 2 ? [200, 190, 90] : [35, 80, 130]));
    const features = computeFeatures(pixels, width, height);
    const result = slic(features, { superpixelSize: 16, compactness: 14, iterations: 4 });
    expect(result.count).toBeGreaterThan(1);
    const left = result.labels[32 * width + 5];
    const right = result.labels[32 * width + width - 6];
    expect(left).not.toBe(right);
  });
});

describe('interpretable ISOM rules', () => {
  const match = (signature: Parameters<typeof classifySignature>[0]) => classifySignature(signature, DEFAULT_CLASSIFICATION_PARAMS);

  it('classifies water, forest, open ground and artificial surfaces', () => {
    expect(match({ L: 30, a: 0, b: -28, sat: 0.6, value: 0.5, variance: 20, lbp: 0.12, edgeDensity: 0.02 }).classId).toBe(CLASS_WATER);
    expect(match({ L: 38, a: -24, b: 22, sat: 0.6, value: 0.4, variance: 180, lbp: 0.32, edgeDensity: 0.2 }).classId).toBe(CLASS_VEG);
    expect(match({ L: 76, a: -4, b: 44, sat: 0.5, value: 0.8, variance: 30, lbp: 0.1, edgeDensity: 0.03 }).classId).toBe(CLASS_OPEN);
    expect(match({ L: 62, a: 0, b: 1, sat: 0.02, value: 0.6, variance: 25, lbp: 0.08, edgeDensity: 0.15 }).classId).toBe(CLASS_ART);
  });

  it('keeps dark ambiguous pixels explicitly unclassified', () => {
    const decision = match({ L: 8, a: 2, b: 3, sat: 0.1, value: 0.05, variance: 4, lbp: 0.05, edgeDensity: 0 });
    expect(decision.classId).toBe(CLASS_UNC);
  });

  it('returns a confidence and all class scores', () => {
    const decision = classifySignature({ L: 30, a: 0, b: -30, sat: 0.6, value: 0.5, variance: 10, lbp: 0.1, edgeDensity: 0 }, DEFAULT_CLASSIFICATION_PARAMS);
    expect(decision.confidence).toBeGreaterThan(0.6);
    expect(decision.confidence).toBeLessThanOrEqual(1);
    expect(Object.keys(decision.scores)).toHaveLength(5);
  });
});

describe('morphology', () => {
  it('removes an isolated pixel with a majority filter', () => {
    const labels = new Uint8Array(25);
    labels[12] = 3;
    const filtered = majorityFilter(labels, 5, 5, 1);
    expect(filtered[12]).toBe(0);
  });

  it('drops components below the minimum area', () => {
    const labels = new Uint8Array(100);
    labels[55] = 1;
    labels[56] = 1;
    labels.fill(2, 0, 20);
    const cleaned = removeSmallComponents(labels, 10, 10, 10);
    expect(cleaned[55]).toBe(0);
    expect(cleaned[0]).toBe(2);
  });

  it('fills an enclosed hole without filling the border', () => {
    const labels = new Uint8Array(25).fill(1);
    labels[12] = 0;
    labels[0] = 0;
    const filled = fillEnclosedHoles(labels, 5, 5);
    expect(filled[12]).toBe(1);
    expect(filled[0]).toBe(0);
  });
});

describe('golden synthetic scenes', () => {
  it('separates water and forest under a lighting gradient', () => {
    const width = 192;
    const height = 128;
    const pixels = synthetic(
      width,
      height,
      (_x, y) => (y < height / 2 ? [35, 80, 130] : [40, 96, 44]),
      (x) => 0.65 + (x / width) * 0.65,
      4,
    );
    const result = classifyPixels(pixels, width, height, DEFAULT_CLASSIFICATION_PARAMS);
    let correct = 0;
    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        const expected = y < result.height / 2 ? CLASS_WATER : CLASS_VEG;
        if (result.labels[y * result.width + x] === expected) correct++;
      }
    }
    const accuracy = correct / (result.width * result.height);
    expect(accuracy).toBeGreaterThan(0.88);
    expect(result.confidence.length).toBe(result.labels.length);
  });

  it('does not desaturate a uniformly green forest (legacy grey-world limitation)', () => {
    const width = 160;
    const height = 96;
    const pixels = synthetic(width, height, () => [38, 92, 40], (x) => 0.6 + (x / width) * 0.75, 5);
    const result = classifyPixels(pixels, width, height, DEFAULT_CLASSIFICATION_PARAMS);
    const counts = new Uint32Array(5);
    for (const label of result.labels) counts[label]++;
    const vegetationShare = counts[CLASS_VEG] / result.labels.length;
    expect(vegetationShare).toBeGreaterThan(0.85);
    expect(result.stats.veg).toBeGreaterThan(70);
  });

  it('produces a working-resolution label map for huge inputs', () => {
    const width = 2048;
    const height = 64;
    const pixels = synthetic(width, height, () => [90, 140, 60]);
    const result = classifyPixels(pixels, width, height, { ...DEFAULT_CLASSIFICATION_PARAMS, maxWorkSide: 512 });
    expect(result.width).toBeLessThanOrEqual(512);
    expect(result.labels.length).toBe(result.width * result.height);
  });
});
