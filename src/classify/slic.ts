import type { PixelFeatures } from './features';

export interface SlicOptions {
  superpixelSize: number;
  compactness: number;
  iterations: number;
}

export interface SlicResult {
  labels: Int32Array;
  count: number;
}

function gradientAt(features: PixelFeatures, x: number, y: number): number {
  const { width, height, L } = features;
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const left = L[cy * width + Math.max(0, cx - 1)];
  const right = L[cy * width + Math.min(width - 1, cx + 1)];
  const top = L[Math.max(0, cy - 1) * width + cx];
  const bottom = L[Math.min(height - 1, cy + 1) * width + cx];
  return Math.abs(right - left) + Math.abs(bottom - top);
}

/**
 * Simple Linear Iterative Clustering. Pixels inside a superpixel share the final
 * class, which removes salt-and-pepper noise before classification rather than
 * filtering it afterwards.
 */
export function slic(features: PixelFeatures, options: SlicOptions): SlicResult {
  const { width, height, L, a, b } = features;
  const step = Math.max(6, Math.round(options.superpixelSize));
  const cols = Math.max(1, Math.ceil(width / step));
  const rows = Math.max(1, Math.ceil(height / step));
  const count = cols * rows;
  const compactness = Math.max(1, options.compactness);

  const cx = new Float32Array(count);
  const cy = new Float32Array(count);
  const cl = new Float32Array(count);
  const ca = new Float32Array(count);
  const cb = new Float32Array(count);

  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x = Math.min(width - 1, Math.round((col + 0.5) * step));
      let y = Math.min(height - 1, Math.round((row + 0.5) * step));
      let best = Infinity;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          const ny = Math.max(0, Math.min(height - 1, y + dy));
          const gradient = gradientAt(features, nx, ny);
          if (gradient < best) {
            best = gradient;
            x = nx;
            y = ny;
          }
        }
      }
      cx[index] = x;
      cy[index] = y;
      const pixel = y * width + x;
      cl[index] = L[pixel];
      ca[index] = a[pixel];
      cb[index] = b[pixel];
      index++;
    }
  }

  const labels = new Int32Array(width * height).fill(-1);
  const distances = new Float32Array(width * height);
  const iterations = Math.max(1, Math.min(12, options.iterations));

  for (let iteration = 0; iteration < iterations; iteration++) {
    distances.fill(Infinity);
    labels.fill(-1);

    for (let centre = 0; centre < count; centre++) {
      const x0 = Math.max(0, Math.floor(cx[centre] - step));
      const x1 = Math.min(width - 1, Math.ceil(cx[centre] + step));
      const y0 = Math.max(0, Math.floor(cy[centre] - step));
      const y1 = Math.min(height - 1, Math.ceil(cy[centre] + step));
      const l = cl[centre];
      const aa = ca[centre];
      const bb = cb[centre];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const pixel = y * width + x;
          const dL = L[pixel] - l;
          const dA = a[pixel] - aa;
          const dB = b[pixel] - bb;
          const colour = dL * dL + dA * dA + dB * dB;
          const dx = x - cx[centre];
          const dy = y - cy[centre];
          const space = (dx * dx + dy * dy) * ((compactness / step) ** 2);
          const distance = colour + space;
          if (distance < distances[pixel]) {
            distances[pixel] = distance;
            labels[pixel] = centre;
          }
        }
      }
    }

    const sums = new Float64Array(count * 5);
    const counts = new Uint32Array(count);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        let label = labels[pixel];
        if (label < 0) label = 0;
        counts[label]++;
        const base = label * 5;
        sums[base] += x;
        sums[base + 1] += y;
        sums[base + 2] += L[pixel];
        sums[base + 3] += a[pixel];
        sums[base + 4] += b[pixel];
      }
    }

    for (let centre = 0; centre < count; centre++) {
      if (!counts[centre]) continue;
      const base = centre * 5;
      cx[centre] = sums[base] / counts[centre];
      cy[centre] = sums[base + 1] / counts[centre];
      cl[centre] = sums[base + 2] / counts[centre];
      ca[centre] = sums[base + 3] / counts[centre];
      cb[centre] = sums[base + 4] / counts[centre];
    }
  }

  // Any unassigned pixel takes the nearest centre (rare after distance updates).
  for (let pixel = 0; pixel < labels.length; pixel++) {
    if (labels[pixel] >= 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    let best = 0;
    let bestDistance = Infinity;
    for (let centre = 0; centre < count; centre++) {
      const dx = x - cx[centre];
      const dy = y - cy[centre];
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = centre;
      }
    }
    labels[pixel] = best;
  }

  return { labels, count };
}
