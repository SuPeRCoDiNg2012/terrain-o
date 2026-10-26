import type { Point } from '../model/types';

export interface TreeDetectionInput {
  width: number;
  height: number;
  /** Final cover labels: 1 = vegetation. */
  labels: Uint8Array;
  /** Illumination-corrected L*. */
  L: Float32Array;
  /** 5x5 local variance of L. */
  variance: Float32Array;
  /** 0..1: higher values accept weaker crowns. */
  sensitivity: number;
  minSpacing: number;
  maxTrees: number;
}

export interface DetectedTree extends Point {
  confidence: number;
  /** Approximate crown radius in working pixels. */
  scale: number;
}

function boxMean(
  integral: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number {
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(width - 1, x + radius);
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(height - 1, y + radius);
  const stride = width + 1;
  const sum =
    integral[(y1 + 1) * stride + x1 + 1] -
    integral[y0 * stride + x1 + 1] -
    integral[(y1 + 1) * stride + x0] +
    integral[y0 * stride + x0];
  return sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
}

function integralOf(values: Float32Array, width: number, height: number): Float64Array {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    const source = y * width;
    const previous = y * stride;
    const target = (y + 1) * stride;
    for (let x = 0; x < width; x++) {
      row += values[source + x];
      integral[target + x + 1] = integral[previous + x + 1] + row;
    }
  }
  return integral;
}

/**
 * Detects likely individual tree crowns inside vegetation. It combines local
 * luminance contrast with texture variance and applies non-maximum suppression;
 * it is a detector, not a claim that every visible crown is a tree. Points are
 * always experimental and must remain editable.
 */
export function detectTrees(input: TreeDetectionInput): DetectedTree[] {
  const { width, height, labels, L, variance } = input;
  if (width < 5 || height < 5 || !input.maxTrees) return [];
  const count = width * height;
  if (labels.length !== count || L.length !== count || variance.length !== count) return [];

  const lIntegral = integralOf(L, width, height);
  const response = new Float32Array(count);
  let maxResponse = 0;
  let vegetation = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const pixel = row + x;
      if (labels[pixel] !== 1) continue;
      vegetation++;
      const texture = Math.sqrt(Math.max(0, variance[pixel]));
      // Difference of box means (a cheap Laplacian-of-Gaussian): comparing a
      // small crown-sized window with a larger surrounding window peaks at the
      // centre of a dark or bright crown instead of on its rim.
      const fine = boxMean(lIntegral, width, height, x, y, 2);
      const coarse = boxMean(lIntegral, width, height, x, y, 7);
      const contrast = Math.abs(fine - coarse);
      const value = (texture / 14) * 0.3 + (contrast / 10) * 0.7;
      response[pixel] = value;
      if (value > maxResponse) maxResponse = value;
    }
  }
  if (vegetation < 8 || maxResponse <= 1e-4) return [];

  // A tiny smoothing pass keeps single noisy pixels from becoming candidates.
  const smoothed = new Float32Array(count);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const pixel = row + x;
      if (labels[pixel] !== 1) continue;
      let sum = 0;
      let samples = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const source = yy * width;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (labels[source + xx] !== 1) continue;
          sum += response[source + xx];
          samples++;
        }
      }
      if (samples) smoothed[pixel] = sum / samples;
    }
  }

  const bins = 256;
  const histogram = new Uint32Array(bins);
  for (let pixel = 0; pixel < count; pixel++) {
    if (labels[pixel] !== 1) continue;
    const bin = Math.min(bins - 1, ((smoothed[pixel] / maxResponse) * (bins - 1)) | 0);
    histogram[bin]++;
  }
  const sensitivity = Math.max(0, Math.min(1, input.sensitivity));
  const quantile = 0.9 - 0.25 * sensitivity;
  const target = vegetation * quantile;
  let cumulative = 0;
  let threshold = maxResponse * quantile;
  for (let bin = 0; bin < bins; bin++) {
    cumulative += histogram[bin];
    if (cumulative >= target) {
      threshold = (bin / (bins - 1)) * maxResponse;
      break;
    }
  }
  threshold = Math.max(moduleThresholdFloor(maxResponse), threshold);

  interface Candidate {
    x: number;
    y: number;
    value: number;
  }
  const candidates: Candidate[] = [];
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const pixel = row + x;
      if (labels[pixel] !== 1) continue;
      const value = smoothed[pixel];
      if (value < threshold) continue;
      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (smoothed[pixel + dy * width + dx] > value) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) candidates.push({ x, y, value });
    }
  }
  candidates.sort((a, b) => b.value - a.value || a.y - b.y || a.x - b.x);

  const spacing = Math.max(3, input.minSpacing);
  const spacingSquared = spacing * spacing;
  const cell = spacing;
  const grid = new Map<string, Array<{ x: number; y: number }>>();
  const accepted: DetectedTree[] = [];

  for (const candidate of candidates) {
    if (accepted.length >= input.maxTrees) break;
    const cellX = Math.floor(candidate.x / cell);
    const cellY = Math.floor(candidate.y / cell);
    let blocked = false;
    for (let gy = cellY - 1; gy <= cellY + 1 && !blocked; gy++) {
      for (let gx = cellX - 1; gx <= cellX + 1; gx++) {
        const bucket = grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          const dx = other.x - candidate.x;
          const dy = other.y - candidate.y;
          if (dx * dx + dy * dy < spacingSquared) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
    }
    if (blocked) continue;
    const span = Math.max(1e-6, maxResponse - threshold);
    const confidence = Math.max(0.05, Math.min(1, 0.35 + 0.65 * ((candidate.value - threshold) / span)));
    accepted.push({
      x: candidate.x + 0.5,
      y: candidate.y + 0.5,
      confidence,
      scale: 3 + 4 * confidence,
    });
    const key = `${cellX}:${cellY}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(candidate);
    else grid.set(key, [candidate]);
  }

  return accepted;
}

/** Below this response a "tree" is probably just texture noise. */
function moduleThresholdFloor(maxResponse: number): number {
  return maxResponse * 0.35;
}
