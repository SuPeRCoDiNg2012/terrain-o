import type { Point, WorldFile } from '../model/types';

export class WorldFileError extends Error {}

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parses the six numbers of an ESRI world file: A, D, B, E, C, F. */
export function parseWorldFile(text: string): WorldFile {
  const tokens = text
    .replace(/^\uFEFF/, '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const numbers = tokens.filter((t) => NUMBER_RE.test(t));
  if (numbers.length !== 6) {
    throw new WorldFileError(
      `Il world file deve contenere esattamente 6 numeri (A, D, B, E, C, F); trovati ${numbers.length}.`,
    );
  }
  const [A, D, B, E, C, F] = numbers.map(Number);
  if (![A, D, B, E, C, F].every(Number.isFinite)) {
    throw new WorldFileError('Il world file contiene valori non numerici o non finiti.');
  }
  if (Math.abs(A) < 1e-15 || Math.abs(E) < 1e-15) {
    throw new WorldFileError('Il world file ha una scala nulla o non valida (A o E uguale a zero).');
  }
  return { A, D, B, E, C, F };
}

export function serializeWorldFile(wf: WorldFile): string {
  return [wf.A, wf.D, wf.B, wf.E, wf.C, wf.F]
    .map((n) => Number(n.toPrecision(15)).toString())
    .join('\n');
}

/**
 * World files normally use map units per pixel. Geographic world files have
 * tiny coefficients (degrees/pixel) and a coordinate origin inside the valid
 * lon/lat range. The origin check is essential: metric orthophotos at 0.5 m/px
 * also have small coefficients, and local metric grids can even start near
 * (0, 0). A plausible degrees/pixel step is much smaller than one degree: an
 * image at 1 km/px is ~0.009°/px, so 0.02 is a safe upper bound.
 */
const MAX_DEGREES_PER_PIXEL = 0.02;

export function worldFileUnits(wf: WorldFile): 'degrees' | 'meters' {
  const geographicOrigin = Math.abs(wf.C) <= 180 && Math.abs(wf.F) <= 90;
  const geographicScale =
    Math.abs(wf.A) <= MAX_DEGREES_PER_PIXEL &&
    Math.abs(wf.E) <= MAX_DEGREES_PER_PIXEL;
  return geographicOrigin && geographicScale ? 'degrees' : 'meters';
}

export function pixelToWorld(wf: WorldFile, x: number, y: number): Point {
  return {
    x: wf.A * x + wf.B * y + wf.C,
    y: wf.D * x + wf.E * y + wf.F,
  };
}

export function worldToPixel(wf: WorldFile, x: number, y: number): Point {
  const det = wf.A * wf.E - wf.B * wf.D;
  if (Math.abs(det) < 1e-20) {
    throw new WorldFileError('La trasformazione del world file non è invertibile.');
  }
  const dx = x - wf.C;
  const dy = y - wf.F;
  return {
    x: (wf.E * dx - wf.B * dy) / det,
    y: (-wf.D * dx + wf.A * dy) / det,
  };
}

/** Rescales a world file when the source image is resampled. */
export function scaleWorldFile(wf: WorldFile, scaleX: number, scaleY: number): WorldFile {
  return {
    A: wf.A / scaleX,
    B: wf.B / scaleY,
    D: wf.D / scaleX,
    E: wf.E / scaleY,
    C: wf.C,
    F: wf.F,
  };
}

/** Approximate ground size of one pixel from the affine coefficients (map units). */
export function worldFilePixelSize(wf: WorldFile): number {
  return Math.hypot(wf.A, wf.D);
}

export function isWorldFileText(text: string): boolean {
  try {
    parseWorldFile(text);
    return true;
  } catch {
    return false;
  }
}
