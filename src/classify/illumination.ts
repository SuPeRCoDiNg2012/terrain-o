export interface IlluminationOptions {
  /** Tile edge in pixels (working resolution). */
  tileSize: number;
  /** 0..1 blend between the local estimate and the original luminance. */
  strength: number;
}

export interface IlluminationResult {
  pixels: Uint8ClampedArray;
  /** Confidence of the local estimate, 0..1 per pixel. */
  confidence: Float32Array;
  gainMin: number;
  gainMax: number;
}

interface Grid {
  cols: number;
  rows: number;
  stride: number;
  gains: Float32Array;
  confidence: Float32Array;
  gainMin: number;
  gainMax: number;
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function buildGrid(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tileSize: number,
  strength: number,
): Grid {
  const stride = Math.max(8, Math.round(tileSize / 2));
  const cols = Math.max(1, Math.ceil(width / stride));
  const rows = Math.max(1, Math.ceil(height / stride));
  const gains = new Float32Array(cols * rows);
  const confidence = new Float32Array(cols * rows);
  const half = Math.max(4, Math.floor(tileSize / 2));

  let sum = 0;
  let count = 0;
  const means = new Float32Array(cols * rows);
  const deviations = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const centerX = Math.min(width - 1, Math.round(col * stride + stride / 2));
      const centerY = Math.min(height - 1, Math.round(row * stride + stride / 2));
      const x0 = Math.max(0, centerX - half);
      const x1 = Math.min(width - 1, centerX + half);
      const y0 = Math.max(0, centerY - half);
      const y1 = Math.min(height - 1, centerY + half);
      let localSum = 0;
      let localSq = 0;
      let localCount = 0;
      const step = Math.max(1, Math.floor((x1 - x0) / 32));
      for (let y = y0; y <= y1; y += step) {
        for (let x = x0; x <= x1; x += step) {
          const index = (y * width + x) * 4;
          const value = luma(rgba[index], rgba[index + 1], rgba[index + 2]);
          localSum += value;
          localSq += value * value;
          localCount++;
        }
      }
      const mean = localCount ? localSum / localCount : 0;
      const variance = localCount ? Math.max(0, localSq / localCount - mean * mean) : 0;
      const index = row * cols + col;
      means[index] = mean;
      deviations[index] = Math.sqrt(variance);
      sum += mean;
      count++;
    }
  }

  const globalMean = count ? sum / count : 0;
  const target = Math.max(8, globalMean);

  for (let index = 0; index < gains.length; index++) {
    const mean = means[index];
    const raw = mean > 1 ? target / mean : 1;
    const clamped = Math.max(0.62, Math.min(1.6, raw));
    const blended = 1 + (clamped - 1) * Math.max(0, Math.min(1, strength));
    gains[index] = blended;
    const deviation = deviations[index];
    const flatness = mean > 1 ? 1 - Math.min(1, deviation / (mean * 0.55)) : 0;
    confidence[index] = Math.max(0.2, Math.min(1, 0.35 + flatness * 0.65));
  }

  // 3x3 box blur keeps tile transitions invisible.
  const smooth = new Float32Array(gains.length);
  const smoothConfidence = new Float32Array(gains.length);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let gSum = 0;
      let cSum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const rr = row + dy;
          const cc = col + dx;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          gSum += gains[rr * cols + cc];
          cSum += confidence[rr * cols + cc];
          n++;
        }
      }
      smooth[row * cols + col] = gSum / n;
      smoothConfidence[row * cols + col] = cSum / n;
    }
  }

  let gainMin = Infinity;
  let gainMax = -Infinity;
  for (const value of smooth) {
    if (value < gainMin) gainMin = value;
    if (value > gainMax) gainMax = value;
  }

  return { cols, rows, stride, gains: smooth, confidence: smoothConfidence, gainMin, gainMax };
}

function sampleGrid(grid: Grid, x: number, y: number, values: Float32Array): number {
  const fx = Math.max(0, Math.min(grid.cols - 1, (x - grid.stride / 2) / grid.stride));
  const fy = Math.max(0, Math.min(grid.rows - 1, (y - grid.stride / 2) / grid.stride));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(grid.cols - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = values[y0 * grid.cols + x0];
  const b = values[y0 * grid.cols + x1];
  const c = values[y1 * grid.cols + x0];
  const d = values[y1 * grid.cols + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/**
 * Corrects uneven illumination with overlapping local tiles. It scales luminance
 * only: chroma is preserved, so a uniformly green forest is not desaturated the
 * way a global grey-world balance would.
 */
export function correctIllumination(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: IlluminationOptions,
): IlluminationResult {
  const grid = buildGrid(rgba, width, height, Math.max(16, options.tileSize), options.strength);
  const output = new Uint8ClampedArray(rgba.length);
  const confidence = new Float32Array(width * height);
  const strength = Math.max(0, Math.min(1, options.strength));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const gain = 1 + (sampleGrid(grid, x, y, grid.gains) - 1) * strength;
      const offset = index * 4;
      output[offset] = rgba[offset] * gain;
      output[offset + 1] = rgba[offset + 1] * gain;
      output[offset + 2] = rgba[offset + 2] * gain;
      output[offset + 3] = rgba[offset + 3];
      confidence[index] = sampleGrid(grid, x, y, grid.confidence);
    }
  }

  return {
    pixels: output,
    confidence,
    gainMin: grid.gainMin,
    gainMax: grid.gainMax,
  };
}
