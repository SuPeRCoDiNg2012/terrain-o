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
 * Detects likely individual tree crowns inside vegetation. It is a detector, not
 * a claim that every visible crown is a tree: points stay experimental and
 * editable.
 *
 * A single fine/coarse contrast peaks on a crown *rim* as strongly as on its
 * centre, and it cannot tell a dark crown from a bright one. This detector
 * instead evaluates a signed difference-of-box-means at three crown scales,
 * keeps the scale that responds most strongly, and requires a local extremum in
 * that signing: a crown centre is either clearly darker or clearly brighter than
 * the canopy around it. Scale is also reported, so non-maximum suppression can
 * use the crown's own size instead of one global spacing.
 */
export function detectTrees(input: TreeDetectionInput): DetectedTree[] {
  const { width, height, labels, L, variance } = input;
  if (width < 9 || height < 9 || !input.maxTrees) return [];
  const count = width * height;
  if (labels.length !== count || L.length !== count || variance.length !== count) return [];

  const lIntegral = integralOf(L, width, height);
  // Vegetation coverage, so a crown is only accepted inside the canopy. The
  // step from canopy to meadow is the strongest contrast in the image, and
  // without this guard a quarter of the detections sat on that outline.
  const inside = boundaryDistance(labels, width, height);
  const scales = [3, 5, 8] as const;
  // Signed response per scale, plus the absolute best scale per pixel.
  const response = scales.map(() => new Float32Array(count));
  const bestScale = new Uint8Array(count);
  const bestMagnitude = new Float32Array(count);
  const polarity = new Int8Array(count);
  let vegetation = 0;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const pixel = row + x;
      if (labels[pixel] !== 1) continue;
      vegetation++;
      let bestIndex = 0;
      let bestValue = 0;
      for (let index = 0; index < scales.length; index++) {
        const radius = scales[index];
        const inner = boxMean(lIntegral, width, height, x, y, radius);
        const outer = boxMean(lIntegral, width, height, x, y, radius * 2);
        // Normalise by the window size: a big window collects more contrast and
        // would otherwise win every comparison.
        const value = (inner - outer) / Math.sqrt(radius);
        response[index][pixel] = value;
        if (Math.abs(value) > Math.abs(bestValue)) {
          bestValue = value;
          bestIndex = index;
        }
      }
      bestScale[pixel] = bestIndex;
      bestMagnitude[pixel] = Math.abs(bestValue);
      polarity[pixel] = bestValue >= 0 ? 1 : -1;
    }
  }
  if (vegetation < 12) return [];

  // Texture modulates the decision: a crown has structure, a flat roof corner
  // does not. The term is bounded so it can never create a detection alone.
  const textured = new Float32Array(count);
  for (let pixel = 0; pixel < count; pixel++) {
    if (labels[pixel] !== 1) continue;
    textured[pixel] = Math.min(1, Math.sqrt(Math.max(0, variance[pixel])) / 11);
  }

  const score = new Float32Array(count);
  let maxScore = 0;
  for (let pixel = 0; pixel < count; pixel++) {
    if (labels[pixel] !== 1) continue;
    const value = bestMagnitude[pixel] * (0.82 + 0.18 * textured[pixel]);
    score[pixel] = value;
    if (value > maxScore) maxScore = value;
  }
  if (maxScore <= 1e-4) return [];

  const bins = 256;
  const histogram = new Uint32Array(bins);
  for (let pixel = 0; pixel < count; pixel++) {
    if (labels[pixel] !== 1) continue;
    const bin = Math.min(bins - 1, ((score[pixel] / maxScore) * (bins - 1)) | 0);
    histogram[bin]++;
  }
  const sensitivity = Math.max(0, Math.min(1, input.sensitivity));
  // The top fraction of the vegetation becomes candidates. A crown occupies a
  // small share of the canopy, so the quantile stays conservative.
  const quantile = 0.9 - 0.25 * sensitivity;
  const target = vegetation * quantile;
  let cumulative = 0;
  let threshold = maxScore * quantile;
  for (let bin = 0; bin < bins; bin++) {
    cumulative += histogram[bin];
    if (cumulative >= target) {
      threshold = (bin / (bins - 1)) * maxScore;
      break;
    }
  }
  threshold = Math.max(maxScore * 0.3, threshold);

  interface Candidate {
    x: number;
    y: number;
    value: number;
    scale: number;
  }
  const candidates: Candidate[] = [];
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const pixel = row + x;
      if (labels[pixel] !== 1) continue;
      const value = score[pixel];
      if (value < threshold) continue;
      const scaleIndex = bestScale[pixel];
      const signed = response[scaleIndex];
      const own = signed[pixel] * polarity[pixel];
      // A crown centre must be an extremum of its own signed scale, and the
      // extremum must be a peak of that polarity, not just large in magnitude.
      let isPeak = true;
      for (let dy = -1; dy <= 1 && isPeak; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const neighbour = pixel + dy * width + dx;
          if (labels[neighbour] !== 1) continue;
          if (bestScale[neighbour] !== scaleIndex) continue;
          if (signed[neighbour] * polarity[pixel] > own) {
            isPeak = false;
            break;
          }
        }
      }
      if (!isPeak) continue;
      // A closed crown has a lower response all around it. A ridge in the canopy
      // (the edge of a shadow band, a path between crowns) can still be a 3x3
      // maximum along its crest, so sample a ring and require its mean to sit
      // clearly below the centre.
      const radius = Math.max(2, Math.round(scales[scaleIndex] * 1.6));
      let ringSum = 0;
      let ringSamples = 0;
      for (let step = 0; step < 8; step++) {
        const angle = (step / 8) * Math.PI * 2;
        const rx = Math.max(0, Math.min(width - 1, Math.round(x + Math.cos(angle) * radius)));
        const ry = Math.max(0, Math.min(height - 1, Math.round(y + Math.sin(angle) * radius)));
        const neighbour = ry * width + rx;
        if (labels[neighbour] !== 1) continue;
        ringSum += signed[neighbour] * polarity[pixel];
        ringSamples++;
      }
      if (ringSamples >= 4 && ringSum / ringSamples > own * 0.82) continue;
      const crown = scales[scaleIndex];
      // The canopy outline is a step edge with enormous contrast: peaks there
      // are geometry, not trees. Distance to the nearest non-vegetation pixel
      // rejects them without touching interior crowns.
      if (inside[pixel] < crown * 1.2 + 1) continue;
      candidates.push({ x, y, value, scale: crown });
    }
  }
  candidates.sort((a, b) => b.value - a.value || a.y - b.y || a.x - b.x);

  const baseSpacing = Math.max(3, input.minSpacing);
  // Crowns that look larger may sit closer to each other than two small ones
  // piled in the same pixel; the radius comes from the winning scale.
  const spacingOf = (candidate: { scale: number }) => Math.max(8, baseSpacing, candidate.scale * 2.7);
  // A fixed cell size is essential: keying the grid by each candidate's own
  // spacing mixes bucket sizes, and neighbours then fall outside the lookup.
  const cell = Math.max(4, baseSpacing);
  const reach = Math.ceil(Math.max(...scales.map((scale) => scale * 2.7)) / cell) + 1;
  const grid = new Map<string, Array<{ x: number; y: number; spacing: number }>>();
  const accepted: DetectedTree[] = [];

  for (const candidate of candidates) {
    if (accepted.length >= input.maxTrees) break;
    const spacing = spacingOf(candidate);
    const cellX = Math.floor(candidate.x / cell);
    const cellY = Math.floor(candidate.y / cell);
    let blocked = false;
    for (let gy = cellY - reach; gy <= cellY + reach && !blocked; gy++) {
      for (let gx = cellX - reach; gx <= cellX + reach; gx++) {
        const bucket = grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          const dx = other.x - candidate.x;
          const dy = other.y - candidate.y;
          const limit = Math.max(spacing, other.spacing);
          if (dx * dx + dy * dy < limit * limit) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
    }
    if (blocked) continue;
    const span = Math.max(1e-6, maxScore - threshold);
    const confidence = Math.max(0.05, Math.min(1, 0.3 + 0.7 * ((candidate.value - threshold) / span)));
    accepted.push({
      x: candidate.x + 0.5,
      y: candidate.y + 0.5,
      confidence,
      scale: candidate.scale,
    });
    const key = `${cellX}:${cellY}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push({ x: candidate.x, y: candidate.y, spacing });
    else grid.set(key, [{ x: candidate.x, y: candidate.y, spacing }]);
  }

  return accepted;
}

/**
 * Distance (px) from every vegetation pixel to the nearest non-vegetation
 * pixel, via a two-pass chamfer transform. O(n) and exact enough for the guard
 * above; a Euclidean distance transform would cost more for no visible gain.
 */
function boundaryDistance(labels: Uint8Array, width: number, height: number): Float32Array {
  const count = labels.length;
  const distance = new Float32Array(count);
  const INF = 1e6;
  const diagonal = Math.SQRT2;
  for (let index = 0; index < count; index++) distance[index] = labels[index] === 1 ? INF : 0;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const index = row + x;
      if (distance[index] === 0) continue;
      let best = distance[index];
      if (y > 0) {
        best = Math.min(best, distance[index - width] + 1);
        if (x > 0) best = Math.min(best, distance[index - width - 1] + diagonal);
        if (x < width - 1) best = Math.min(best, distance[index - width + 1] + diagonal);
      }
      if (x > 0) best = Math.min(best, distance[index - 1] + 1);
      distance[index] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x--) {
      const index = row + x;
      if (distance[index] === 0) continue;
      let best = distance[index];
      if (y < height - 1) {
        best = Math.min(best, distance[index + width] + 1);
        if (x > 0) best = Math.min(best, distance[index + width - 1] + diagonal);
        if (x < width - 1) best = Math.min(best, distance[index + width + 1] + diagonal);
      }
      if (x < width - 1) best = Math.min(best, distance[index + 1] + 1);
      if (x > 0) best = Math.min(best, distance[index - 1] + 1);
      distance[index] = best;
    }
  }
  return distance;
}
