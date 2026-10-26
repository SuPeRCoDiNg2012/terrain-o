import { describe, expect, it } from 'vitest';
import { detectTrees } from './trees';

function syntheticScene(): {
  width: number;
  height: number;
  labels: Uint8Array;
  L: Float32Array;
  variance: Float32Array;
} {
  const width = 96;
  const height = 96;
  const labels = new Uint8Array(width * height).fill(1);
  const L = new Float32Array(width * height);
  const centres = [
    { x: 22, y: 24 },
    { x: 60, y: 30 },
    { x: 44, y: 68 },
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 58 + Math.sin(x * 0.31) * 1.2 + Math.cos(y * 0.27) * 1.1;
      for (const centre of centres) {
        const dx = x - centre.x;
        const dy = y - centre.y;
        value -= 24 * Math.exp(-(dx * dx + dy * dy) / 18);
      }
      L[y * width + x] = value;
    }
  }
  // 5x5 local variance, matching what the feature stage produces.
  const variance = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let squares = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const v = L[yy * width + xx];
          sum += v;
          squares += v * v;
          count++;
        }
      }
      const mean = sum / count;
      variance[y * width + x] = Math.max(0, squares / count - mean * mean);
    }
  }
  return { width, height, labels, L, variance };
}

describe('tree crown detector', () => {
  it('finds the three synthetic crowns without flooding the map', () => {
    const scene = syntheticScene();
    const trees = detectTrees({
      ...scene,
      sensitivity: 0.7,
      minSpacing: 9,
      maxTrees: 12,
    });
    expect(trees.length).toBeGreaterThanOrEqual(3);
    expect(trees.length).toBeLessThanOrEqual(8);
    for (const centre of [{ x: 22, y: 24 }, { x: 60, y: 30 }, { x: 44, y: 68 }]) {
      const nearest = trees.reduce(
        (best, tree) => Math.min(best, Math.hypot(tree.x - centre.x, tree.y - centre.y)),
        Infinity,
      );
      expect(nearest).toBeLessThan(6);
    }
    expect(trees.every((tree) => tree.confidence > 0 && tree.confidence <= 1)).toBe(true);
  });

  it('returns nothing outside vegetation and respects the cap', () => {
    const scene = syntheticScene();
    const noVegetation = detectTrees({
      ...scene,
      labels: new Uint8Array(scene.width * scene.height),
      sensitivity: 1,
      minSpacing: 4,
      maxTrees: 50,
    });
    expect(noVegetation).toEqual([]);

    const capped = detectTrees({
      ...scene,
      sensitivity: 1,
      minSpacing: 3,
      maxTrees: 2,
    });
    expect(capped).toHaveLength(2);
  });
});
