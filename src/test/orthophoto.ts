/**
 * Deterministic synthetic orthophoto used to measure the pipeline.
 *
 * The image is not a pretty picture: it is a scene with a known ground truth.
 * Every pixel carries the class the photograph actually shows, and every crown
 * centre is recorded, so classification accuracy and tree detection can be
 * measured instead of judged by eye. It deliberately includes the hard parts of
 * a real survey orthophoto: a large soft shadow, canopy texture, specular water,
 * roof and road edges, and a rock face with high local variance.
 */
export const SCENE_WIDTH = 960;
export const SCENE_HEIGHT = 720;

export const SCENE_CLASS = { veg: 1, open: 2, water: 3, artificial: 4 } as const;

export interface SceneCrown {
  x: number;
  y: number;
}

export interface SyntheticScene {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Ground-truth class per pixel, 0 where the scene has no claim. */
  truth: Uint8Array;
  crowns: SceneCrown[];
  /** Metres per pixel, used by the world file. */
  scaleMeters: number;
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise with smooth interpolation; enough to look like ground texture. */
function noiseField(width: number, height: number, cells: number, seed: number): Float32Array {
  const random = mulberry(seed);
  const grid = cells + 1;
  const lattice = new Float32Array(grid * grid);
  for (let index = 0; index < lattice.length; index++) lattice[index] = random();
  const field = new Float32Array(width * height);
  const sx = cells / width;
  const sy = cells / height;
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    const fy = y * sy;
    const y0 = Math.min(cells - 1, Math.floor(fy));
    const ty = fade(fy - y0);
    for (let x = 0; x < width; x++) {
      const fx = x * sx;
      const x0 = Math.min(cells - 1, Math.floor(fx));
      const tx = fade(fx - x0);
      const a = lattice[y0 * grid + x0];
      const b = lattice[y0 * grid + x0 + 1];
      const c = lattice[(y0 + 1) * grid + x0];
      const d = lattice[(y0 + 1) * grid + x0 + 1];
      field[y * width + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return field;
}

function fbm(width: number, height: number, seed: number): Float32Array {
  const octaves = [noiseField(width, height, 6, seed), noiseField(width, height, 18, seed + 1), noiseField(width, height, 54, seed + 2)];
  const field = new Float32Array(width * height);
  for (let index = 0; index < field.length; index++) {
    field[index] = octaves[0][index] * 0.55 + octaves[1][index] * 0.3 + octaves[2][index] * 0.15;
  }
  return field;
}

interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  phase: number;
}

function insideBlob(x: number, y: number, blob: Blob, wobble = 0): boolean {
  const angle = Math.atan2((y - blob.cy) / blob.ry, (x - blob.cx) / blob.rx);
  const radius = 1 + wobble * Math.sin(angle * 3 + blob.phase) * 0.5 + wobble * Math.cos(angle * 5 - blob.phase) * 0.35;
  return ((x - blob.cx) / blob.rx) ** 2 + ((y - blob.cy) / blob.ry) ** 2 <= radius * radius;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

export function buildSyntheticScene(): SyntheticScene {
  const width = SCENE_WIDTH;
  const height = SCENE_HEIGHT;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const truth = new Uint8Array(width * height);
  const random = mulberry(20261027);
  const texture = fbm(width, height, 91);
  const fine = noiseField(width, height, 260, 17);

  // Scene layout, in pixels, chosen so every surface is large enough to matter.
  const forest: Blob = { cx: width * 0.36, cy: height * 0.44, rx: width * 0.3, ry: height * 0.36, phase: 1.2 };
  const lake: Blob = { cx: width * 0.82, cy: height * 0.74, rx: width * 0.19, ry: height * 0.22, phase: 0.4 };
  // A pond fully inside the meadow: the only shape that forces a real hole in
  // the surrounding open-ground polygon, so hole handling is exercised too.
  const pond: Blob = { cx: width * 0.5, cy: height * 0.87, rx: width * 0.05, ry: height * 0.06, phase: 0.9 };
  const rock: Blob = { cx: width * 0.86, cy: height * 0.16, rx: width * 0.12, ry: height * 0.15, phase: 2.1 };
  const building = { x0: width * 0.07, y0: height * 0.76, x1: width * 0.25, y1: height * 0.94 };
  const road = { x0: width * 0.04, y0: height * 0.06, x1: width * 0.52, y1: height * 0.14, width: 26 };
  const shadow = { cx: width * 0.28, cy: height * 0.42, rx: width * 0.34, ry: height * 0.42 };

  // Crown centres, scattered inside the forest blob.
  const crowns: SceneCrown[] = [];
  const crownCount = 420;
  while (crowns.length < crownCount) {
    const x = random() * width;
    const y = random() * height;
    if (!insideBlob(x, y, forest, 0.9)) continue;
    if (Math.hypot(x - forest.cx, y - forest.cy) > Math.min(forest.rx, forest.ry) * 1.02) continue;
    crowns.push({ x, y });
  }

  const roadDistance = (x: number, y: number): number => {
    const dx = road.x1 - road.x0;
    const dy = road.y1 - road.y0;
    const lengthSq = dx * dx + dy * dy;
    let t = ((x - road.x0) * dx + (y - road.y0) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (road.x0 + t * dx), y - (road.y0 + t * dy));
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const grain = (texture[pixel] - 0.5) * 22 + (fine[pixel] - 0.5) * 16;

      // Meadow: warm yellow-green with mowing bands.
      let r = 138 + grain + Math.sin(x / 26) * 6;
      let g = 156 + grain;
      let b = 74 + grain * 0.6;
      let classId: number = SCENE_CLASS.open;

      if (insideBlob(x, y, rock, 0.35)) {
        const speckle = fine[pixel] > 0.72 ? 26 : 0;
        r = 158 + grain + speckle;
        g = 156 + grain + speckle;
        b = 150 + grain + speckle;
        classId = SCENE_CLASS.artificial;
      } else if (insideBlob(x, y, pond, 0.08) || insideBlob(x, y, lake, 0.12)) {
        const ripple = Math.sin(x / 7 + Math.sin(y / 11) * 2) * 7 + Math.sin(y / 5) * 3;
        r = 26 + ripple * 0.4;
        g = 66 + ripple * 0.5;
        b = 104 + ripple;
        classId = SCENE_CLASS.water;
      } else if (insideBlob(x, y, forest, 0.22)) {
        r = 44 + grain * 0.5;
        g = 82 + grain * 0.6;
        b = 40 + grain * 0.4;
        classId = SCENE_CLASS.veg;
      }

      // Road: dark asphalt with coarse aggregate, painted over meadow/forest.
      const distance = roadDistance(x, y);
      if (distance < road.width / 2) {
        const asphalt = 46 + fine[pixel] * 26;
        r = asphalt;
        g = asphalt + 2;
        b = asphalt + 6;
        classId = SCENE_CLASS.artificial;
      }

      // Roof, ridge and a hard cast shadow to the south-east.
      if (x >= building.x0 && x <= building.x1 && y >= building.y0 && y <= building.y1) {
        const ridge = Math.abs((x - (building.x0 + building.x1) / 2) / ((building.x1 - building.x0) / 2));
        const roof = 122 - ridge * 16 + (fine[pixel] - 0.5) * 10;
        r = roof + 26;
        g = roof + 4;
        b = roof - 12;
        classId = SCENE_CLASS.artificial;
      } else if (
        x >= building.x1 &&
        x <= building.x1 + 26 &&
        y >= building.y0 + 8 &&
        y <= building.y1 + 14
      ) {
        r *= 0.55;
        g *= 0.55;
        b *= 0.58;
      }

      // Soft cast shadow across the western side: the hard case for a global
      // grey-world balance, which would bleach it instead of correcting it.
      const shadowDistance = Math.hypot((x - shadow.cx) / shadow.rx, (y - shadow.cy) / shadow.ry);
      if (shadowDistance < 1) {
        const factor = 0.52 + 0.48 * Math.min(1, shadowDistance * shadowDistance);
        r *= factor;
        g *= factor;
        b *= factor * 1.02;
      }

      rgba[offset] = clampByte(r);
      rgba[offset + 1] = clampByte(g);
      rgba[offset + 2] = clampByte(b);
      rgba[offset + 3] = 255;
      truth[pixel] = classId as number;
    }
  }

  // Crowns painted after the base so their shading survives the shadow pass.
  for (const crown of crowns) {
    const radius = 4 + random() * 3.5;
    const ring = 1 + random() * 0.25;
    for (let dy = -Math.ceil(radius * ring); dy <= Math.ceil(radius * ring); dy++) {
      for (let dx = -Math.ceil(radius * ring); dx <= Math.ceil(radius * ring); dx++) {
        const x = Math.round(crown.x + dx);
        const y = Math.round(crown.y + dy);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const distance = Math.hypot(dx / radius, dy / (radius * ring));
        if (distance > 1) continue;
        const pixel = y * width + x;
        const offset = pixel * 4;
        const light = 1.12 - distance * 0.5;
        rgba[offset] = clampByte(rgba[offset] * light * 0.86);
        rgba[offset + 1] = clampByte(rgba[offset + 1] * light);
        rgba[offset + 2] = clampByte(rgba[offset + 2] * light * 0.82);
      }
    }
  }

  return { width, height, rgba, truth, crowns, scaleMeters: 0.05 };
}

/**
 * Same scene through worse optics: two 3×3 blur passes, a hard shadow band and
 * a sinusoidal exposure falloff. This is the realistic variant the classifier
 * has to survive, not just the clean render.
 */
export function hardenScene(scene: SyntheticScene): SyntheticScene {
  const { width, height } = scene;
  const rgba = new Uint8ClampedArray(scene.rgba);
  for (let pass = 0; pass < 2; pass++) {
    const copy = new Uint8ClampedArray(rgba);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const offset = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += copy[((y + dy) * width + (x + dx)) * 4 + channel];
            }
          }
          rgba[offset + channel] = sum / 9;
        }
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const shadow = x < width * 0.45 ? 0.45 : 1;
      const exposure = 0.75 + 0.35 * Math.sin((x / width) * 3.1);
      rgba[offset] = rgba[offset] * shadow * exposure;
      rgba[offset + 1] = rgba[offset + 1] * shadow * exposure;
      rgba[offset + 2] = rgba[offset + 2] * shadow * exposure * 1.04;
    }
  }
  return { ...scene, rgba };
}

/** Laplacian-free helper: count matching pixels between two label maps. */
export function accuracyAgainst(truth: Uint8Array, labels: Uint8Array): number {
  let correct = 0;
  for (let index = 0; index < truth.length; index++) if (truth[index] === labels[index]) correct++;
  return correct / truth.length;
}

/** Per-class precision/recall, so one easy class cannot hide a broken one. */
export function perClassScores(
  truth: Uint8Array,
  labels: Uint8Array,
  classIds: number[],
): Record<number, { precision: number; recall: number; iou: number }> {
  const scores: Record<number, { precision: number; recall: number; iou: number }> = {};
  for (const classId of classIds) {
    let truePositive = 0;
    let predicted = 0;
    let actual = 0;
    let union = 0;
    for (let index = 0; index < truth.length; index++) {
      const expected = truth[index] === classId;
      const predictedHere = labels[index] === classId;
      if (expected) actual++;
      if (predictedHere) predicted++;
      if (expected && predictedHere) truePositive++;
      if (expected || predictedHere) union++;
    }
    scores[classId] = {
      precision: predicted ? truePositive / predicted : 0,
      recall: actual ? truePositive / actual : 0,
      iou: union ? truePositive / union : 0,
    };
  }
  return scores;
}
