const CLASS_COUNT = 5;

/** Mode filter in a square window; ties keep the centre label. */
export function majorityFilter(labels: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const r = Math.max(0, Math.min(6, Math.round(radius)));
  if (r === 0 || width < 3 || height < 3) return labels.slice();
  const output = new Uint8Array(labels.length);
  const counts = new Uint16Array(CLASS_COUNT);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      counts.fill(0);
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * width;
        for (let xx = x0; xx <= x1; xx++) counts[labels[row + xx]]++;
      }
      let best = labels[y * width + x];
      let bestCount = counts[best] ?? 0;
      for (let classId = 0; classId < CLASS_COUNT; classId++) {
        if (counts[classId] > bestCount) {
          bestCount = counts[classId];
          best = classId;
        }
      }
      output[y * width + x] = best;
    }
  }
  return output;
}

interface Component {
  size: number;
  label: number;
  pixels: number[];
}

function components(labels: Uint8Array, width: number, height: number): Component[] {
  const visited = new Uint8Array(labels.length);
  const list: Component[] = [];
  const queue = new Int32Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    if (visited[start]) continue;
    const label = labels[start];
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const pixels: number[] = [];
    while (head < tail) {
      const index = queue[head++];
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) {
        const next = index - 1;
        if (!visited[next] && labels[next] === label) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (x < width - 1) {
        const next = index + 1;
        if (!visited[next] && labels[next] === label) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y > 0) {
        const next = index - width;
        if (!visited[next] && labels[next] === label) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y < height - 1) {
        const next = index + width;
        if (!visited[next] && labels[next] === label) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    list.push({ size: pixels.length, label, pixels });
  }
  return list;
}

/** Removes connected components smaller than minPx; they become unclassified. */
export function removeSmallComponents(labels: Uint8Array, width: number, height: number, minPx: number): Uint8Array {
  if (minPx <= 1) return labels.slice();
  const output = labels.slice();
  for (const component of components(labels, width, height)) {
    if (component.label === 0) continue;
    if (component.size >= minPx) continue;
    for (const pixel of component.pixels) output[pixel] = 0;
  }
  return output;
}

/**
 * Fills enclosed unclassified regions with their surrounding majority class.
 * Border-connected unclassified pixels are left untouched: they are genuinely
 * "outside the map" and must stay explicitly unclassified.
 *
 * The previous one-pass implementation only filled holes thin enough for the
 * row-major scan to reach in a single sweep; anything larger than a couple of
 * pixels stayed unknown. This version marks the outside, then floods each
 * enclosed component and stamps it with the class that surrounds it.
 */
export function fillEnclosedHoles(labels: Uint8Array, width: number, height: number): Uint8Array {
  const output = labels.slice();
  const outside = new Uint8Array(labels.length);
  const queue = new Int32Array(labels.length);
  let head = 0;
  let tail = 0;

  const pushOutside = (index: number) => {
    if (outside[index] || output[index] !== 0) return;
    outside[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    pushOutside(x);
    pushOutside((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    pushOutside(y * width);
    pushOutside(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) pushOutside(index - 1);
    if (x < width - 1) pushOutside(index + 1);
    if (y > 0) pushOutside(index - width);
    if (y < height - 1) pushOutside(index + width);
  }

  const visited = new Uint8Array(labels.length);
  const component = new Int32Array(labels.length);
  const counts = new Uint16Array(CLASS_COUNT);

  for (let start = 0; start < output.length; start++) {
    if (visited[start] || outside[start] || output[start] !== 0) continue;
    let cHead = 0;
    let cTail = 0;
    component[cTail++] = start;
    visited[start] = 1;
    counts.fill(0);

    while (cHead < cTail) {
      const index = component[cHead++];
      const x = index % width;
      const y = (index / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const neighbour = yy * width + xx;
          const label = output[neighbour];
          if (label !== 0) {
            counts[label]++;
            continue;
          }
          if (!visited[neighbour] && !outside[neighbour]) {
            visited[neighbour] = 1;
            component[cTail++] = neighbour;
          }
        }
      }
    }

    let best = 0;
    let bestCount = 0;
    for (let classId = 1; classId < CLASS_COUNT; classId++) {
      if (counts[classId] > bestCount) {
        bestCount = counts[classId];
        best = classId;
      }
    }
    if (best === 0) continue;
    for (let index = 0; index < cTail; index++) output[component[index]] = best;
  }

  return output;
}

/** Local agreement of a label with its 3x3 neighbourhood, 0..1. */
export function labelAgreement(labels: Uint8Array, width: number, height: number): Float32Array {
  const agreement = new Float32Array(labels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      let same = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          total++;
          if (labels[yy * width + xx] === label) same++;
        }
      }
      agreement[y * width + x] = total ? same / total : 1;
    }
  }
  return agreement;
}
