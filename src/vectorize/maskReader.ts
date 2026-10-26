export interface MaskInput {
  labels: Uint8Array;
  width: number;
  height: number;
  confidence?: Float32Array | null;
  /**
   * Optional per-class binary claims (0–255 ownership strength). Used when the
   * caller has one probabilistic mask per class rather than a single label map;
   * overlapping claims are resolved here, before any contour is traced.
   */
  claims?: Map<number, Uint8Array> | null;
}

export interface MaskOptions {
  /** Classes to extract. Defaults to every class present in the labels. */
  categories?: number[];
  /** Pixels below this confidence are not part of the class mask. */
  confidenceThreshold: number;
  /** Resolve overlapping claims by class specificity instead of label order. */
  hierarchyPriority?: boolean;
}

export interface MaskSet {
  width: number;
  height: number;
  classes: number[];
  masks: Map<number, Uint8Array>;
  /** Pixel confidence, all ones when the input did not provide it. */
  confidence: Float32Array;
  /** Pixels claimed by more than one class before resolution. */
  contested?: number;
}

/**
 * ISOM specificity rank used only to break a contested pixel, never as a claim
 * about the ground. Water is more specific than open ground, vegetation more
 * specific than bare open, artificial surfaces are on par with open ground.
 */
export const CLASS_SPECIFICITY: Record<number, number> = {
  1: 2,
  2: 1,
  3: 3,
  4: 1,
  5: 3,
};

function resolveClaims(
  claims: Map<number, Uint8Array>,
  width: number,
  height: number,
  threshold: number,
  hierarchyPriority: boolean,
  confidence: Float32Array | null,
): { classes: number[]; masks: Map<number, Uint8Array>; contested: number } {
  const classes = [...claims.keys()].filter((id) => id > 0).sort((a, b) => a - b);
  const masks = new Map<number, Uint8Array>();
  for (const classId of classes) masks.set(classId, new Uint8Array(width * height));
  let contested = 0;

  const total = width * height;
  for (let index = 0; index < total; index++) {
    let best = -1;
    let bestQuality = -1;
    let bestRank = -1;
    let owners = 0;
    if (confidence && confidence[index] < threshold) continue;
    for (const classId of classes) {
      const claim = claims.get(classId);
      if (!claim || claim[index] < Math.round(threshold * 255)) continue;
      owners++;
      const strength = claim[index];
      const rank = hierarchyPriority ? (CLASS_SPECIFICITY[classId] ?? 0) : 0;
      const pixelConfidence = confidence ? Math.round(confidence[index] * 255) : 255;
      // Confidence first; the ISOM specificity only wins a tie.
      const quality = strength + pixelConfidence;
      if (quality > bestQuality || (quality === bestQuality && rank > bestRank)) {
        bestQuality = quality;
        bestRank = rank;
        best = classId;
      }
    }
    if (owners > 1) contested++;
    if (best > 0) masks.get(best)![index] = 1;
  }

  return { classes, masks, contested };
}

/**
 * Converts a label map (or a set of per-class claim maps) into one binary mask
 * per class. Pixels outside the image are treated as empty by the contour
 * extractor, so no dirty border padding is needed here.
 */
export function readMasks(input: MaskInput, options: MaskOptions): MaskSet {
  const { width, height } = input;
  if (input.labels.length !== width * height) {
    throw new Error(`Mappa etichette non coerente: ${input.labels.length} pixel per ${width}×${height}.`);
  }

  const threshold = Math.max(0, Math.min(1, options.confidenceThreshold));
  const confidence = input.confidence && input.confidence.length === width * height ? input.confidence : null;

  if (input.claims && input.claims.size) {
    const resolved = resolveClaims(
      input.claims,
      width,
      height,
      threshold,
      Boolean(options.hierarchyPriority),
      confidence,
    );
    const requested = options.categories?.length
      ? resolved.classes.filter((id) => options.categories!.includes(id))
      : resolved.classes;
    const masks = new Map<number, Uint8Array>();
    for (const classId of requested) {
      const mask = resolved.masks.get(classId);
      if (mask && mask.some((value) => value === 1)) masks.set(classId, mask);
    }
    return {
      width,
      height,
      classes: [...masks.keys()],
      masks,
      confidence: confidence ?? new Float32Array(width * height).fill(1),
      contested: resolved.contested,
    };
  }

  const { labels } = input;
  const present = new Set<number>();
  for (const label of labels) if (label > 0) present.add(label);
  const requested = options.categories?.length ? options.categories.filter((id) => id > 0) : [...present];
  const classes = [...new Set(requested)].filter((id) => present.has(id)).sort((a, b) => a - b);

  const masks = new Map<number, Uint8Array>();
  for (const classId of classes) masks.set(classId, new Uint8Array(width * height));

  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    const mask = masks.get(label);
    if (!mask) continue;
    if (confidence && confidence[index] < threshold) continue;
    mask[index] = 1;
  }

  return {
    width,
    height,
    classes,
    masks,
    confidence: confidence ?? new Float32Array(labels.length).fill(1),
  };
}

/** Mean confidence of the pixels actually inside a class mask. */
export function meanConfidence(mask: Uint8Array, confidence: Float32Array): number {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    sum += confidence[index];
    count++;
  }
  return count ? sum / count : 0;
}
