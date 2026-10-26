import { describe, expect, it } from 'vitest';
import { DEFAULT_CLASSIFICATION_PARAMS } from '../model/constants';
import { recognizeSymbols } from './recognize';

interface Scene {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  truth: Uint8Array;
}

/**
 * Four vertical bands (forest, water, open, artificial) plus a darker building
 * rectangle inside the artificial band. Everything is flat and noiseless, so a
 * model that learns the classes should recover the scene almost perfectly.
 */
function scene(): Scene {
  const width = 192;
  const height = 128;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const truth = new Uint8Array(width * height);
  const bands: Array<[number, number, number]> = [
    [40, 96, 44],
    [35, 78, 128],
    [198, 186, 96],
    [150, 150, 150],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const band = Math.min(3, Math.floor(x / (width / 4)));
      let color = bands[band];
      let classId = band + 1;
      if (band === 3 && x >= 150 && x < 178 && y >= 30 && y < 82) {
        color = [88, 88, 92];
        classId = 5;
      }
      const offset = (y * width + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
      truth[y * width + x] = classId;
    }
  }
  return { width, height, rgba, truth };
}

function labelsFromTruth(truth: Uint8Array): { labels: Uint8Array; weights: Float32Array } {
  return {
    labels: truth.slice(),
    weights: new Float32Array(truth.length).fill(2),
  };
}

describe('AI recognition', () => {
  it('learns training labels and recovers all classes including buildings', () => {
    const image = scene();
    const training = labelsFromTruth(image.truth);
    const result = recognizeSymbols({
      rgba: image.rgba,
      width: image.width,
      height: image.height,
      params: DEFAULT_CLASSIFICATION_PARAMS,
      trainLabels: training.labels,
      trainWeights: training.weights,
      options: {
        pseudoLabels: false,
        detectTrees: false,
        majorityWindow: 1,
        minComponentPx: 8,
        minBuildingPx: 12,
        seed: 5,
      },
    });

    let correct = 0;
    for (let index = 0; index < image.truth.length; index++) {
      if (result.labels[index] === image.truth[index]) correct++;
    }
    const accuracy = correct / image.truth.length;
    expect(accuracy).toBeGreaterThan(0.82);
    expect(result.stats.labelledSamples).toBeGreaterThan(10);
    expect(result.stats.pseudoSamples).toBe(0);
    expect(result.stats.classes).toBeGreaterThanOrEqual(4);
    expect(result.stats.classPixels[5]).toBeGreaterThan(100);
    expect(result.stats.validation).toBeGreaterThan(50);
    expect(result.stats.featureImportance).toHaveLength(5);
  });

  it('falls back to confident rule pseudo-labels without OSM or manual areas', () => {
    const image = scene();
    const result = recognizeSymbols({
      rgba: image.rgba,
      width: image.width,
      height: image.height,
      params: DEFAULT_CLASSIFICATION_PARAMS,
      trainLabels: new Uint8Array(image.width * image.height),
      trainWeights: new Float32Array(image.width * image.height),
      options: {
        pseudoLabels: true,
        detectTrees: false,
        majorityWindow: 1,
        minComponentPx: 8,
        seed: 11,
      },
    });
    expect(result.stats.labelledSamples).toBe(0);
    expect(result.stats.pseudoSamples).toBeGreaterThan(5);
    expect(result.stats.classPixels[1]).toBeGreaterThan(0);
    expect(result.stats.classPixels[3]).toBeGreaterThan(0);
  });

  it('refuses to train when neither examples nor pseudo-labels are available', () => {
    const image = scene();
    expect(() =>
      recognizeSymbols({
        rgba: image.rgba,
        width: image.width,
        height: image.height,
        params: DEFAULT_CLASSIFICATION_PARAMS,
        trainLabels: new Uint8Array(image.width * image.height),
        trainWeights: new Float32Array(image.width * image.height),
        options: { pseudoLabels: false, detectTrees: false },
      }),
    ).toThrow(/Servono più esempi/);
  });
});
