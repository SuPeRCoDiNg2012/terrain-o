import { describe, expect, it } from 'vitest';
import {
  buildSyntheticScene,
  hardenScene,
  accuracyAgainst,
  perClassScores,
  type SyntheticScene,
} from '../test/orthophoto';
import { classifyPixels, type ClassificationResult } from './classify';
import { DEFAULT_CLASSIFICATION_PARAMS } from '../model/constants';
import { correctIllumination } from './illumination';
import { computeFeatures } from './features';
import { detectTrees } from '../ai/trees';
import { vectorize } from '../vectorize/pipeline';
import { validateRegions } from '../vectorize/topology';

/**
 * End-to-end quality gate on a scene whose ground truth is known. These numbers
 * are not decoration: they are the measured behaviour of the pipeline, so a
 * change that improves one stage while breaking another fails here.
 */

function truthAtWorkingSize(scene: SyntheticScene, result: ClassificationResult): Uint8Array {
  const truth = new Uint8Array(result.width * result.height);
  const factorX = scene.width / result.width;
  const factorY = scene.height / result.height;
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      truth[y * result.width + x] = scene.truth[Math.floor(y * factorY) * scene.width + Math.floor(x * factorX)];
    }
  }
  return truth;
}

function matchedCrowns(scene: SyntheticScene, trees: Array<{ x: number; y: number }>, tolerance = 9) {
  const used = new Set<number>();
  let matched = 0;
  for (const crown of scene.crowns) {
    let best = -1;
    let bestDistance = tolerance;
    trees.forEach((tree, index) => {
      if (used.has(index)) return;
      const distance = Math.hypot(tree.x - crown.x, tree.y - crown.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best >= 0) {
      used.add(best);
      matched++;
    }
  }
  return matched;
}

describe('realistic orthophoto quality gate', () => {
  const scene = buildSyntheticScene();

  it('classifies a sunlit orthophoto with high per-class scores', () => {
    const result = classifyPixels(scene.rgba, scene.width, scene.height, DEFAULT_CLASSIFICATION_PARAMS);
    const truth = truthAtWorkingSize(scene, result);
    const accuracy = accuracyAgainst(truth, result.labels);
    expect(accuracy).toBeGreaterThan(0.99);
    const scores = perClassScores(truth, result.labels, [1, 2, 3, 4]);
    for (const classId of [1, 2, 3, 4]) {
      expect(scores[classId].iou, `class ${classId} IoU`).toBeGreaterThan(0.97);
    }
  });

  it('keeps its accuracy under hard shadow, grain and soft optics', () => {
    const hard = hardenScene(scene);
    const result = classifyPixels(hard.rgba, scene.width, scene.height, DEFAULT_CLASSIFICATION_PARAMS);
    const truth = truthAtWorkingSize(scene, result);
    expect(accuracyAgainst(truth, result.labels)).toBeGreaterThan(0.985);
    const scores = perClassScores(truth, result.labels, [1, 2, 3, 4]);
    // The hard case is exactly where a global grey-world balance used to fail:
    // shadowed meadow was read as vegetation. 124k pixels were misclassified
    // before the hue-based split.
    for (const classId of [1, 2, 3, 4]) {
      expect(scores[classId].iou, `class ${classId} IoU under shadow`).toBeGreaterThan(0.95);
    }
  });

  it('detects crowns with usable recall and without flooding the map', () => {
    const illuminated = correctIllumination(scene.rgba, scene.width, scene.height, {
      tileSize: DEFAULT_CLASSIFICATION_PARAMS.tileSize ?? 64,
      strength: DEFAULT_CLASSIFICATION_PARAMS.localBalance ?? 0.85,
    });
    const features = computeFeatures(illuminated.pixels, scene.width, scene.height);
    const trees = detectTrees({
      width: scene.width,
      height: scene.height,
      labels: scene.truth,
      L: features.L,
      variance: features.variance,
      sensitivity: 0.65,
      minSpacing: 8,
      maxTrees: 600,
    });
    expect(trees.length).toBeLessThanOrEqual(600);
    expect(trees.length).toBeGreaterThan(0);
    const matched = matchedCrowns(scene, trees);
    const recall = matched / scene.crowns.length;
    const precision = matched / trees.length;
    expect(recall, 'crown recall').toBeGreaterThan(0.65);
    expect(precision, 'crown precision').toBeGreaterThan(0.68);
    // No detection may sit on the canopy outline: those peaks are the polygon
    // boundary, not trees (23% of detections used to be there).
    for (const tree of trees) {
      let nearest = Infinity;
      for (let dy = -12; dy <= 12; dy++) {
        const y = Math.round(tree.y) + dy;
        if (y < 0 || y >= scene.height) continue;
        for (let dx = -12; dx <= 12; dx++) {
          const x = Math.round(tree.x) + dx;
          if (x < 0 || x >= scene.width) continue;
          if (scene.truth[y * scene.width + x] === 1) continue;
          nearest = Math.min(nearest, Math.hypot(dx, dy));
        }
      }
      expect(nearest).toBeGreaterThan(1);
    }
    for (const tree of trees) {
      expect(tree.confidence).toBeGreaterThan(0);
      expect(tree.confidence).toBeLessThanOrEqual(1);
      expect(tree.scale).toBeGreaterThanOrEqual(3);
    }
  });

  it('vectorizes the whole frame: no gaps, holes kept, geometry valid', () => {
    const result = classifyPixels(scene.rgba, scene.width, scene.height, DEFAULT_CLASSIFICATION_PARAMS);
    const truth = truthAtWorkingSize(scene, result);
    const vector = vectorize({
      labels: result.labels,
      width: result.width,
      height: result.height,
      confidence: result.confidence,
    });

    expect(vector.stats.invalid).toBe(0);
    expect(vector.stats.discarded).toBe(0);
    expect(validateRegions(vector.regions)).toHaveLength(0);

    // The pond is the one enclosed hole: it must survive as a hole, not become
    // a missing area or a separate overlapping polygon.
    expect(vector.stats.holes).toBe(1);

    const areaByClass: Record<number, number> = {};
    for (const region of vector.regions) {
      areaByClass[region.classId] = (areaByClass[region.classId] ?? 0) + region.area;
    }
    const truthArea: Record<number, number> = {};
    for (const value of truth) truthArea[value] = (truthArea[value] ?? 0) + 1;

    let covered = 0;
    for (const classId of [1, 2, 3, 4]) {
      const predicted = areaByClass[classId] ?? 0;
      covered += predicted;
      const expected = truthArea[classId];
      expect(Math.abs(predicted - expected) / expected, `class ${classId} area error`).toBeLessThan(0.02);
    }
    // Adjacent classes tile the frame: no strip of image is left uncovered.
    expect(covered / (result.width * result.height)).toBeGreaterThan(0.995);

    // Shared boundaries are actually shared, and no ring repeats a vertex.
    const owners = new Map<string, Set<number>>();
    vector.regions.forEach((region, index) => {
      for (const point of [...region.coords, ...region.holes.flat()]) {
        const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        const set = owners.get(key) ?? new Set<number>();
        set.add(index);
        owners.set(key, set);
      }
    });
    let shared = 0;
    for (const set of owners.values()) if (set.size > 1) shared++;
    expect(shared).toBeGreaterThan(50);
    for (const region of vector.regions) {
      const keys = region.coords.map((point) => `${point.x},${point.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    // Simplification must not be a no-op: the raw staircase has thousands of
    // vertices, the cleaned output a few hundred.
    const vertices = vector.regions.reduce((sum, region) => sum + region.coords.length, 0);
    expect(vertices).toBeLessThan(1500);
  });
});
