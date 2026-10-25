import { extractContours } from './src/vectorize/contourExtractor';
import { ringSelfIntersects } from './src/vectorize/topology';

for (let size = 3; size <= 4; size++) {
  const cells = size * size;
  let found = false;
  for (let pattern = 1; pattern < 1 << cells && !found; pattern++) {
    const mask = new Uint8Array(cells);
    for (let index = 0; index < cells; index++) if (pattern & (1 << index)) mask[index] = 1;
    const rings = extractContours(mask, size, size);
    if (!rings.some((ring) => ringSelfIntersects(ring.points))) continue;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
      let row = '';
      for (let x = 0; x < size; x++) row += mask[y * size + x] ? '#' : '.';
      rows.push(row);
    }
    console.log(`size ${size} pattern ${pattern}`);
    console.log(rows.join('\n'));
    found = true;
  }
  if (found) break;
}
