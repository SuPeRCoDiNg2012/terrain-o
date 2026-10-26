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

const PAD = 2;
const D65_X = 0.95047;
const D65_Y = 1;
const D65_Z = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

/** sRGB byte to linear-light lookup, computed once instead of per pixel. */
const LINEAR = (() => {
  const table = new Float32Array(256);
  for (let value = 0; value < 256; value++) {
    const c = value / 255;
    table[value] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

function labF(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

/**
 * Otsu threshold over 64 bins. The caller already knows the maximum value, so
 * the separate max scan is skipped.
 */
function otsu(values: Float32Array, max: number): number {
  const bins = 64;
  if (max <= 0) return 0;
  const histogram = new Float64Array(bins);
  for (let index = 0; index < values.length; index++) {
    const bin = Math.min(bins - 1, ((values[index] / max) * (bins - 1)) | 0);
    histogram[bin]++;
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

/**
 * Computes colour, texture, variance and edge features in a small, constant
 * number of passes.
 *
 * The previous version called a clamping sampler 25 times per pixel for the
 * variance, allocated a 7-element ring array per pixel for LBP and returned a
 * fresh Lab object per pixel. On a 2048² image that is over 4 million objects
 * and more than 100 million guarded samples. Here the luminance is copied once
 * into a 2-pixel replicated border, the 5×5 variance is a separable box filter,
 * and LBP/Sobel read the padded buffer directly.
 */
export function computeFeatures(rgba: Uint8ClampedArray, width: number, height: number): PixelFeatures {
  const count = width * height;
  const L = new Float32Array(count);
  const a = new Float32Array(count);
  const b = new Float32Array(count);
  const variance = new Float32Array(count);
  const lbp = new Float32Array(count);
  const edge = new Uint8Array(count);
  const edgeStrength = new Float32Array(count);

  const pw = width + 4;
  const ph = height + 4;
  const padded = new Float32Array(pw * ph);

  for (let y = 0; y < height; y++) {
    const paddedRow = (y + PAD) * pw + PAD;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const offset = index * 4;
      const rl = LINEAR[rgba[offset]];
      const gl = LINEAR[rgba[offset + 1]];
      const bl = LINEAR[rgba[offset + 2]];

      const fx = labF(
        (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / D65_X,
      );
      const fy = labF(
        (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / D65_Y,
      );
      const fz = labF(
        (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / D65_Z,
      );

      const lightness = 116 * fy - 16;
      L[index] = lightness;
      a[index] = 500 * (fx - fy);
      b[index] = 200 * (fy - fz);
      padded[paddedRow + x] = lightness;
    }
  }

  // Replicate the image border horizontally along every interior row.
  for (let y = 0; y < height; y++) {
    const row = (y + PAD) * pw;
    padded[row] = padded[row + 1] = padded[row + PAD];
    padded[row + width + 2] = padded[row + width + 3] = padded[row + width + 1];
  }
  // Replicate the top and bottom rows across the full padded width.
  for (let x = 0; x < pw; x++) {
    padded[x] = padded[2 * pw + x];
    padded[pw + x] = padded[2 * pw + x];
    padded[(height + PAD) * pw + x] = padded[(height + 1) * pw + x];
    padded[(height + PAD + 1) * pw + x] = padded[(height + 1) * pw + x];
  }

  // Horizontal 5-wide box sums per padded row, kept in a five-row ring.
  const hRows = new Float32Array(5 * pw);
  const hSquares = new Float32Array(5 * pw);
  const loadRow = (sourceRow: number, slot: number) => {
    const base = sourceRow * pw;
    const target = slot * pw;
    let sum = 0;
    let squares = 0;
    for (let k = 0; k < 5; k++) {
      const value = padded[base + k];
      sum += value;
      squares += value * value;
    }
    hRows[target] = sum;
    hSquares[target] = squares;
    for (let x = 1; x < width; x++) {
      const added = padded[base + x + 4];
      const removed = padded[base + x - 1];
      sum += added - removed;
      squares += added * added - removed * removed;
      hRows[target + x] = sum;
      hSquares[target + x] = squares;
    }
  };

  for (let slot = 0; slot < 5; slot++) loadRow(slot, slot);
  const windowSum = new Float32Array(width);
  const windowSquares = new Float32Array(width);
  for (let slot = 0; slot < 5; slot++) {
    const base = slot * pw;
    for (let x = 0; x < width; x++) {
      windowSum[x] += hRows[base + x];
      windowSquares[x] += hSquares[base + x];
    }
  }

  let maxMagnitude = 0;
  const cell = 1 / 25;

  for (let y = 0; y < height; y++) {
    const aboveRow = (y + PAD - 1) * pw;
    const centreRow = (y + PAD) * pw;
    const belowRow = (y + PAD + 1) * pw;
    const outputRow = y * width;

    for (let x = 0; x < width; x++) {
      const index = outputRow + x;
      const centre = padded[centreRow + x + PAD];
      const mean = windowSum[x] * cell;
      variance[index] = Math.max(0, windowSquares[x] * cell - mean * mean);

      const tl = padded[aboveRow + x + 1];
      const tc = padded[aboveRow + x + 2];
      const tr = padded[aboveRow + x + 3];
      const ml = padded[centreRow + x + 1];
      const mr = padded[centreRow + x + 3];
      const bl = padded[belowRow + x + 1];
      const bc = padded[belowRow + x + 2];
      const br = padded[belowRow + x + 3];

      // LBP transitions around the centre, in the same order as before.
      let previous = tl >= centre ? 1 : 0;
      const first = previous;
      let transitions = 0;
      let bit = ml >= centre ? 1 : 0;
      if (bit !== previous) transitions++;
      previous = bit;
      bit = bl >= centre ? 1 : 0;
      if (bit !== previous) transitions++;
      previous = bit;
      bit = bc >= centre ? 1 : 0;
      if (bit !== previous) transitions++;
      previous = bit;
      bit = br >= centre ? 1 : 0;
      if (bit !== previous) transitions++;
      previous = bit;
      bit = mr >= centre ? 1 : 0;
      if (bit !== previous) transitions++;
      previous = bit;
      bit = tr >= centre ? 1 : 0;
      if (bit !== previous) transitions++;
      previous = bit;
      bit = tc >= centre ? 1 : 0;
      if (bit !== previous) transitions++;
      previous = bit;
      if (previous !== first) transitions++;
      lbp[index] = transitions / 8;

      const gx = tr + 2 * mr + br - tl - 2 * ml - bl;
      const gy = bl + 2 * bc + br - tl - 2 * tc - tr;
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeStrength[index] = magnitude;
      if (magnitude > maxMagnitude) maxMagnitude = magnitude;
    }

    if (y + 1 < height) {
      const slot = y % 5;
      const base = slot * pw;
      for (let x = 0; x < width; x++) {
        windowSum[x] -= hRows[base + x];
        windowSquares[x] -= hSquares[base + x];
      }
      loadRow(y + 5, slot);
      for (let x = 0; x < width; x++) {
        windowSum[x] += hRows[base + x];
        windowSquares[x] += hSquares[base + x];
      }
    }
  }

  const threshold = Math.max(6, otsu(edgeStrength, maxMagnitude));
  for (let index = 0; index < count; index++) {
    edge[index] = edgeStrength[index] > threshold ? 1 : 0;
  }

  return { width, height, L, a, b, variance, lbp, edge, edgeStrength };
}
