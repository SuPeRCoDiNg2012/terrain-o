import { describe, expect, it } from 'vitest';
import { vectorize } from './pipeline';
import { DEFAULT_VECTORIZE_OPTIONS } from './types';

describe('vectorization benchmark', () => {
  it('4000x4000 with 4 classified classes stays under 15 s', () => {
    const width = 4000;
    const height = 4000;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const band = Math.floor((x + 180 * Math.sin(y / 190) + 90 * Math.sin(x / 310)) / 420);
        labels[y * width + x] = 1 + (Math.abs(band) % 4);
      }
    }
    const started = performance.now();
    const result = vectorize({ width, height, labels }, DEFAULT_VECTORIZE_OPTIONS);
    const elapsed = performance.now() - started;
    console.log(`BENCHMARK 4000x4000: ${elapsed.toFixed(1)} ms, ${result.stats.polygons} polygons, ${result.stats.holes} holes, ${result.stats.discarded} discarded, ${result.stats.elapsedMs} ms pipeline`);
    expect(result.stats.polygons).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(15000);
  }, 120000);
});
