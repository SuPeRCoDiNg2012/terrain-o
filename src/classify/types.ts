/**
 * A class prior is external evidence that a pixel probably belongs to one of
 * the four classifier families. It is deliberately separate from the label
 * output: it can only influence a decision, never declare a verified feature.
 */
export interface ClassPriorMap {
  width: number;
  height: number;
  /** 0 = no prior, 1..4 = vegetation/open/water/artificial. */
  classes: Uint8Array;
  /** 0..1 confidence of the prior at each pixel. */
  strength: Float32Array;
}
