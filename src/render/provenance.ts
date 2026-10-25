import type { Feature, Point } from '../model/types';

/**
 * Provenance presentation is centralised here: vector provenance is conveyed by
 * the border only (dashed = automatic, solid = manual, solid + check = verified).
 * Never by a question mark, a floating badge or a loud label.
 */
export type ProvenanceLevel = 'auto' | 'manual' | 'verified';

export interface ProvenanceStyle {
  /** Neutral, never alarming. */
  color: string;
  width: number;
  dashed: boolean;
  check: boolean;
}

export const PROVENANCE_STYLES: Record<ProvenanceLevel, ProvenanceStyle> = {
  auto: { color: '#93a1b1', width: 1.05, dashed: true, check: false },
  manual: { color: '#9aa7b5', width: 1.15, dashed: false, check: false },
  verified: { color: '#9aa7b5', width: 1.15, dashed: false, check: true },
};

export function featureProvenance(feature: Pick<Feature, 'verified' | 'source'>): ProvenanceLevel {
  if (feature.verified) return 'verified';
  // Classification, OSM and DEM are all automatic interpretations. Only
  // geometry drawn or imported by the user is "manual".
  if (feature.source === 'vector' || feature.source === 'osm' || feature.source === 'dem') return 'auto';
  return 'manual';
}

/** Single word used by the status bar, per the presentation rules. */
export function provenanceWord(level: ProvenanceLevel): 'auto' | 'manuale' | 'verificato' {
  if (level === 'auto') return 'auto';
  if (level === 'verified') return 'verificato';
  return 'manuale';
}

export function provenanceText(level: ProvenanceLevel): string {
  if (level === 'auto') return 'Origine: automatica';
  if (level === 'verified') return 'Origine: verificata';
  return 'Origine: manuale';
}

/** Small tick in the top-right corner of an element's bounds. */
export function drawProvenanceCheck(
  ctx: CanvasRenderingContext2D,
  corner: Point,
  unit: number,
  color = '#8aa694',
): void {
  const size = 4.6 * unit;
  const box = 11 * unit;
  ctx.save();
  ctx.translate(corner.x, corner.y);
  ctx.fillStyle = 'rgba(20, 27, 34, 0.72)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 0.8 * unit;
  ctx.beginPath();
  ctx.roundRect(-box / 2, -box / 2, box, box, 2.2 * unit);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 * unit;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-size * 0.55, 0);
  ctx.lineTo(-size * 0.1, size * 0.45);
  ctx.lineTo(size * 0.6, -size * 0.45);
  ctx.stroke();
  ctx.restore();
}
