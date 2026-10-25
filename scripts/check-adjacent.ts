import { vectorize } from './src/vectorize/pipeline';
import { ringArea } from './src/vectorize/topology';

const width = 240;
const height = 200;
const labels = new Uint8Array(width * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const boundary = width / 2 + Math.sin(y / 18) * 22 + Math.cos(y / 7) * 6;
    labels[y * width + x] = x < boundary ? 1 : 2;
  }
}

for (const smoothIterations of [0, 1, 2]) {
  for (const reconcileEdges of [false, true]) {
    const result = vectorize(
      { labels, width, height },
      { categories: [1, 2], minAreaPx: 10, minHoleAreaPx: 5, simplifyTolerance: 1.5, smoothIterations, reconcileEdges },
    );
    const total = result.regions.reduce((sum, region) => sum + region.area, 0);
    console.log('smooth', smoothIterations, 'reconcile', reconcileEdges, 'ratio', (total / (width * height)).toFixed(4));
    for (const r of result.regions) {
      const xs = r.coords.map((p) => p.x);
      const ys = r.coords.map((p) => p.y);
      console.log('  class', r.classId, 'area', r.area.toFixed(1), 'verts', r.coords.length, 'x', Math.min(...xs).toFixed(1), Math.max(...xs).toFixed(1), 'y', Math.min(...ys).toFixed(1), Math.max(...ys).toFixed(1), 'raw', ringArea(r.coords).toFixed(1));
    }
  }
}
