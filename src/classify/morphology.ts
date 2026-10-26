const CLASS_COUNT = 5;

/**
 * Mode filter in a square window; ties keep the centre label.
 *
 * The naive version re-counted up to 25 pixels for every output pixel. This
 * version slides a horizontal class-count window along each row and a vertical
 * window of those rows, so the cost per pixel is constant instead of O(r²).
 */
export function majorityFilter(
  labels: Uint8Array,
  width: number,
  height: number,
  radius: number,
  classCount = CLASS_COUNT,
): Uint8Array {
  const r = Math.max(0, Math.min(6, Math.round(radius)));
  if (r === 0 || width < 3 || height < 3) return labels.slice();
  const output = new Uint8Array(labels.length);
  const kw = 2 * r + 1;
  const rows = new Uint16Array(kw * width * classCount);
  const vertical = new Uint16Array(width * classCount);
  const counts = new Uint16Array(classCount);

  const fillRow = (sourceRow: number) => {
    const slot = sourceRow % kw;
    const base = slot * width * classCount;
    const row = sourceRow * width;
    counts.fill(0);
    for (let column = 0; column < Math.min(width, r + 1); column++) {
      counts[labels[row + column]]++;
    }
    for (let x = 0; x < width; x++) {
      const target = base + x * classCount;
      for (let classId = 0; classId < classCount; classId++) rows[target + classId] = counts[classId];
      const remove = x - r;
      if (remove >= 0) counts[labels[row + remove]]--;
      const add = x + r + 1;
      if (add < width) counts[labels[row + add]]++;
    }
  };

  const addRow = (sourceRow: number, sign: 1 | -1) => {
    const base = (sourceRow % kw) * width * classCount;
    for (let x = 0; x < width; x++) {
      const pixel = x * classCount;
      const source = base + pixel;
      for (let classId = 0; classId < classCount; classId++) {
        vertical[pixel + classId] += sign * rows[source + classId];
      }
    }
  };

  const first = Math.min(height, r + 1);
  for (let row = 0; row < first; row++) {
    fillRow(row);
    addRow(row, 1);
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const base = x * classCount;
      const centre = labels[row + x];
      let best = centre;
      let bestCount = vertical[base + centre];
      for (let classId = 0; classId < classCount; classId++) {
        const count = vertical[base + classId];
        if (count > bestCount) {
          bestCount = count;
          best = classId;
        }
      }
      output[row + x] = best;
    }

    const leaving = y - r;
    if (leaving >= 0) addRow(leaving, -1);
    const entering = y + r + 1;
    if (entering < height) {
      fillRow(entering);
      addRow(entering, 1);
    }
  }

  return output;
}

/**
 * Removes connected components smaller than minPx; they become unclassified.
 * Two passes with a component-id map avoid allocating one pixel array per
 * component, which dominated both time and memory on large orthophotos.
 */
export function removeSmallComponents(labels: Uint8Array, width: number, height: number, minPx: number): Uint8Array {
  if (minPx <= 1) return labels.slice();
  const output = labels.slice();
  const total = labels.length;
  const component = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  const sizes: number[] = [];

  for (let start = 0; start < total; start++) {
    const label = output[start];
    if (label === 0 || component[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    component[start] = id;
    while (head < tail) {
      const index = queue[head++];
      size++;
      const x = index % width;
      if (x > 0) {
        const next = index - 1;
        if (component[next] === -1 && output[next] === label) {
          component[next] = id;
          queue[tail++] = next;
        }
      }
      if (x < width - 1) {
        const next = index + 1;
        if (component[next] === -1 && output[next] === label) {
          component[next] = id;
          queue[tail++] = next;
        }
      }
      if (index >= width) {
        const next = index - width;
        if (component[next] === -1 && output[next] === label) {
          component[next] = id;
          queue[tail++] = next;
        }
      }
      if (index < total - width) {
        const next = index + width;
        if (component[next] === -1 && output[next] === label) {
          component[next] = id;
          queue[tail++] = next;
        }
      }
    }
    sizes.push(size);
  }

  for (let index = 0; index < total; index++) {
    const id = component[index];
    if (id >= 0 && sizes[id] < minPx) output[index] = 0;
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
export function fillEnclosedHoles(
  labels: Uint8Array,
  width: number,
  height: number,
  classCount = CLASS_COUNT,
): Uint8Array {
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
  const counts = new Uint16Array(classCount);

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
    for (let classId = 1; classId < classCount; classId++) {
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
