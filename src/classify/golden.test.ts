import { describe, expect, it } from 'vitest';
import { classifyPixels, workingSize } from './classify';
import { DEFAULT_CLASSIFICATION_PARAMS } from '../model/constants';
import { CLASS_ART, CLASS_OPEN, CLASS_VEG, CLASS_WATER } from './rules';
import { readMasks } from '../vectorize/maskReader';

function scene(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
  shade: (x: number, y: number) => number = () => 1,
  noise = 0,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
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

function accuracyOf(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  expected: (x: number, y: number) => number,
): number {
  const result = classifyPixels(pixels, width, height, DEFAULT_CLASSIFICATION_PARAMS);
  let correct = 0;
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      if (result.labels[y * result.width + x] === expected(x, y)) correct++;
    }
  }
  return correct / (result.width * result.height);
}

describe('golden classification scenes', () => {
  it('recognises water in shadow next to sunlit forest', () => {
    const width = 160;
    const height = 120;
    const pixels = scene(
      width,
      height,
      (x) => (x < width / 2 ? [32, 74, 124] : [38, 96, 44]),
      (x, y) => (x < width / 2 ? 0.45 + (x / width) * 0.1 + (y / height) * 0.1 : 0.62 + (x / width) * 0.7),
      4,
    );
    const accuracy = accuracyOf(pixels, width, height, (x) => (x < width / 2 ? CLASS_WATER : CLASS_VEG));
    expect(accuracy).toBeGreaterThan(0.9);
  });

  it('separates vegetation, water, open ground and artificial surfaces', () => {
    const width = 200;
    const height = 100;
    const pixels = scene(
      width,
      height,
      (x, y) => {
        const column = Math.min(3, Math.floor((x / width) * 4));
        if (column === 0) return [40, 96, 44];
        if (column === 1) return [35, 78, 128];
        if (column === 2) return [198, 186, 96];
        return y < height / 2 ? [150, 150, 150] : [120, 120, 122];
      },
      (x) => 0.6 + (x / width) * 0.7,
      5,
    );
    const accuracy = accuracyOf(pixels, width, height, (x) => {
      const column = Math.min(3, Math.floor((x / width) * 4));
      return [CLASS_VEG, CLASS_WATER, CLASS_OPEN, CLASS_ART][column];
    });
    expect(accuracy).toBeGreaterThan(0.9);
  });

  it('reduces by longest side, never by the shorter one', () => {
    expect(workingSize(400, 100, 2048)).toMatchObject({ width: 400, height: 100, factor: 1 });
    expect(workingSize(4000, 300, 1000)).toMatchObject({ width: 1000, height: 75, factor: 4 });
    expect(workingSize(100, 100, 100)).toMatchObject({ width: 100, height: 100, factor: 1 });
  });

  it('classifies a single-pixel image without throwing', () => {
    const pixels = scene(1, 1, () => [40, 96, 44]);
    const result = classifyPixels(pixels, 1, 1, DEFAULT_CLASSIFICATION_PARAMS);
    expect(result.labels).toHaveLength(1);
    expect(Number.isFinite(result.confidence[0])).toBe(true);
  });

  it('fills an enclosed hole completely, not just its first rows', () => {
    const width = 80;
    const height = 80;
    const pixels = scene(
      width,
      height,
      (x, y) => (x > 20 && x < 60 && y > 20 && y < 60 ? [128, 128, 128] : [40, 96, 44]),
      undefined,
      2,
    );
    const result = classifyPixels(pixels, width, height, {
      ...DEFAULT_CLASSIFICATION_PARAMS,
      fillHoles: true,
      minComponentPx: 6,
    });
    let unknownInside = 0;
    for (let y = 22; y < 58; y++) {
      for (let x = 22; x < 58; x++) {
        if (result.labels[y * result.width + x] === 0) unknownInside++;
      }
    }
    expect(unknownInside).toBe(0);
  });

  it('keeps clean interiors above the default vectorization confidence', () => {
    const width = 160;
    const height = 120;
    const pixels = scene(
      width,
      height,
      (x) => {
        const column = Math.min(3, Math.floor((x / width) * 4));
        return [
          [40, 96, 44],
          [35, 78, 128],
          [198, 186, 96],
          [135, 135, 135],
        ][column] as [number, number, number];
      },
      (x) => 0.6 + (x / width) * 0.7,
      4,
    );
    const result = classifyPixels(pixels, width, height, DEFAULT_CLASSIFICATION_PARAMS);
    const above = result.confidence.reduce((sum, value) => sum + (value >= 0.6 ? 1 : 0), 0);
    expect(above / result.confidence.length).toBeGreaterThan(0.8);
  });
});

describe('mask reader contracts', () => {
  it('honours the confidence threshold for claim maps', () => {
    const width = 4;
    const height = 1;
    const confidence = new Float32Array([0.9, 0.9, 0.4, 0.9]);
    const claims = new Map<number, Uint8Array>();
    claims.set(1, new Uint8Array([255, 255, 255, 255]));
    const masks = readMasks(
      { labels: new Uint8Array(width * height), width, height, confidence, claims },
      { confidenceThreshold: 0.6 },
    );
    expect([...(masks.masks.get(1) ?? [])]).toEqual([1, 1, 0, 1]);
  });
});
