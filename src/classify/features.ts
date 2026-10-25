import { rgbToLab } from './colorSpace';

export interface PixelFeatures {
  width: number;
  height: number;
  L: Float32Array;
  a: Float32Array;
  b: Float32Array;
  /** 5x5 local variance of L. */
  variance: Float32Array;
  /** 0 = uniform 3x3 neighbourhood, 0.5 = random texture. */
  lbp: Float32Array;
  /** 1 where the Sobel magnitude exceeds the Otsu threshold. */
  edge: Uint8Array;
  /** Mean edge magnitude, useful for confidence. */
  edgeStrength: Float32Array;
}

function otsu(values: Float32Array): number {
  const bins = 64;
  const histogram = new Float64Array(bins);
  let max = 0;
  for (const value of values) if (value > max) max = value;
  if (max <= 0) return 0;
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor((value / max) * (bins - 1)));
    histogram[index]++;
  }
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * histogram[i];
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;
  for (let i = 0; i < bins; i++) {
    weightBackground += histogram[i];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > bestVariance) {
      bestVariance = between;
      best = i;
    }
  }
  return (best / (bins - 1)) * max;
}

function sampleL(L: Float32Array, width: number, height: number, x: number, y: number): number {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  return L[cy * width + cx];
}

export function computeFeatures(rgba: Uint8ClampedArray, width: number, height: number): PixelFeatures {
  const count = width * height;
  const L = new Float32Array(count);
  const a = new Float32Array(count);
  const b = new Float32Array(count);
  const variance = new Float32Array(count);
  const lbp = new Float32Array(count);
  const edge = new Uint8Array(count);
  const edgeStrength = new Float32Array(count);
  const magnitude = new Float32Array(count);

  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const lab = rgbToLab(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    L[index] = lab.L;
    a[index] = lab.a;
    b[index] = lab.b;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;

      // 5x5 variance with clamped borders.
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const value = sampleL(L, width, height, x + dx, y + dy);
          sum += value;
          sumSq += value * value;
          n++;
        }
      }
      const mean = sum / n;
      variance[index] = Math.max(0, sumSq / n - mean * mean);

      // LBP transitions around the centre.
      const centre = L[index];
      let previous = sampleL(L, width, height, x - 1, y - 1) >= centre ? 1 : 0;
      const first = previous;
      let transitions = 0;
      const ring = [
        [x - 1, y],
        [x - 1, y + 1],
        [x, y + 1],
        [x + 1, y + 1],
        [x + 1, y],
        [x + 1, y - 1],
        [x, y - 1],
      ];
      for (const [rx, ry] of ring) {
        const bit = sampleL(L, width, height, rx, ry) >= centre ? 1 : 0;
        if (bit !== previous) transitions++;
        previous = bit;
      }
      if (previous !== first) transitions++;
      lbp[index] = transitions / 8;

      // Sobel magnitude.
      const tl = sampleL(L, width, height, x - 1, y - 1);
      const tc = sampleL(L, width, height, x, y - 1);
      const tr = sampleL(L, width, height, x + 1, y - 1);
      const ml = sampleL(L, width, height, x - 1, y);
      const mr = sampleL(L, width, height, x + 1, y);
      const bl = sampleL(L, width, height, x - 1, y + 1);
      const bc = sampleL(L, width, height, x, y + 1);
      const br = sampleL(L, width, height, x + 1, y + 1);
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const value = Math.hypot(gx, gy);
      magnitude[index] = value;
      edgeStrength[index] = value;
    }
  }

  const threshold = Math.max(6, otsu(magnitude));
  for (let index = 0; index < count; index++) {
    edge[index] = magnitude[index] > threshold ? 1 : 0;
    magnitude[index] = 0;
  }

  return { width, height, L, a, b, variance, lbp, edge, edgeStrength };
}
