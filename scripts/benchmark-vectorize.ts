import { vectorize } from '../src/vectorize/pipeline';
import { DEFAULT_VECTORIZE_OPTIONS } from '../src/vectorize/types';

const size = Number(process.env.BENCH_SIZE ?? 4000);
const width = size;
const height = size;
const labels = new Uint8Array(width * height);

// Five large regions with wavy borders and a few holes, similar in structure to
// a real classified orthophoto (not a single flat rectangle).
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const u = x / width;
    const v = y / height;
    const wave = Math.sin(u * 12) * 0.04 + Math.cos(v * 9) * 0.04;
    let label = 0;
    if (u + wave < 0.34) label = 1;
    else if (v + wave < 0.4) label = 2;
    else if (u - wave > 0.72 && v - wave > 0.5) label = 3;
    else if (v - wave > 0.78) label = 4;
    else label = 2;
    const dx = u - 0.5;
    const dy = v - 0.5;
    if (label === 1 && dx * dx + dy * dy < 0.012) label = 2;
    labels[y * width + x] = label;
  }
}

const start = performance.now();
const result = vectorize({ labels, width, height }, { ...DEFAULT_VECTORIZE_OPTIONS });
const elapsed = performance.now() - start;

console.log(
  JSON.stringify(
    {
      size,
      classes: 5,
      ms: Math.round(elapsed),
      polygons: result.stats.polygons,
      holes: result.stats.holes,
      discarded: result.stats.discarded,
      invalid: result.stats.invalid,
      vertices: result.regions.reduce((sum, region) => sum + region.coords.length, 0),
    },
    null,
    2,
  ),
);
