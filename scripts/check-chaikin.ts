import { extractContours, signedArea } from './src/vectorize/contourExtractor';
import { chaikinRing } from './src/vectorize/simplify';
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
const masks = [1, 2].map((cls) => {
  const mask = new Uint8Array(width * height);
  labels.forEach((value, index) => { if (value === cls) mask[index] = 1; });
  return mask;
});
const rings = masks.map((mask) => extractContours(mask, width, height)[0]);
console.log('raw areas', rings.map((r) => signedArea(r.points)), 'sum', rings.reduce((s, r) => s + Math.abs(signedArea(r.points)), 0));

for (const iterations of [0, 1, 2]) {
  const smoothed = rings.map((ring) => chaikinRing(ring.points, iterations));
  const areas = smoothed.map((r) => ringArea(r));
  console.log('iterations', iterations, 'areas', areas, 'sum', areas[0] + areas[1], 'verts', smoothed.map((r) => r.length));
}

// Shared boundary coordinates check: count exact shared vertices between the two raw rings.
const key = (p: {x:number;y:number}) => `${p.x},${p.y}`;
const setA = new Set(rings[0].points.map(key));
const shared = rings[1].points.filter((p) => setA.has(key(p))).length;
console.log('shared raw vertices', shared, 'of', rings[1].points.length, rings[0].points.length);

const smA = new Set(chaikinRing(rings[0].points, 2).map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`));
const smB = chaikinRing(rings[1].points, 2).filter((p) => smA.has(`${p.x.toFixed(4)},${p.y.toFixed(4)}`)).length;
console.log('shared smoothed vertices', smB);
