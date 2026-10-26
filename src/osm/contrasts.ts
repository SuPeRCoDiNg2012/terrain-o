import type { ClassificationOsmContrast, OsmWay, Point } from '../model/types';
import { cleanRing, rasterizeRings } from './priorMap';
import { isClosedWay, osmSemanticOf, semanticLabel } from './semantic';

const CLASS_KEY = {
  1: 'veg',
  2: 'open',
  3: 'water',
  4: 'art',
} as const;

export type OsmContrastClassKey = ClassificationOsmContrast['classKey'];

/** Human labels shared by the filter and the CSV export. */
export const OSM_CONTRAST_CLASS_LABELS: Record<OsmContrastClassKey, string> = {
  veg: 'Vegetazione',
  open: 'Aperto',
  water: 'Acqua',
  art: 'Artificiale',
};

export interface OsmContrastOptions {
  /** Minimum working-resolution pixels inside the polygon. */
  minAreaPx?: number;
  /** Only areas at or below this agreement are reported. */
  maxAgreement?: number;
  /** Maximum number of contrasting areas returned. */
  limit?: number;
}

export interface OsmContrastFilter {
  /** Family to keep; `all` (default) keeps every family. */
  classKey?: OsmContrastClassKey | 'all';
  /** Minimum polygon area in working-resolution pixels. */
  minAreaPx?: number;
}

export interface OsmContrastCsvOptions {
  /** OSM ids that already exist as features, exported in a dedicated column. */
  generatedIds?: ReadonlySet<number>;
}

/** Filters the stored report without touching the classification result. */
export function filterOsmContrasts(
  items: ClassificationOsmContrast[],
  filter: OsmContrastFilter = {},
): ClassificationOsmContrast[] {
  const classKey = filter.classKey ?? 'all';
  const minAreaPx = Math.max(0, filter.minAreaPx ?? 0);
  return items.filter(
    (item) => (classKey === 'all' || item.classKey === classKey) && item.areaPx >= minAreaPx,
  );
}

/**
 * Neutralizes spreadsheet formulas coming from OSM names and escapes the cell
 * for RFC 4180 CSV.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Serializes the visible contrast report. Agreement stays numeric with a dot
 * decimal separator so the file is machine-readable; `\r\n` keeps Excel happy.
 */
export function osmContrastsToCsv(
  items: ClassificationOsmContrast[],
  options: OsmContrastCsvOptions = {},
): string {
  const header = ['nome', 'id_osm', 'classe', 'chiave_classe', 'accordo_percento', 'area_px', 'generato'];
  const rows = items.map((item) => [
    csvCell(item.name),
    String(item.osmId),
    csvCell(item.label),
    item.classKey,
    item.agreement.toFixed(1),
    String(item.areaPx),
    options.generatedIds?.has(item.osmId) ? 'sì' : 'no',
  ]);
  return [header, ...rows].map((row) => row.join(',')).join('\r\n');
}

/**
 * Rasterizes each OSM area at working resolution and compares its pixels with
 * the final classification. This is a diagnostic list, not a correction: a low
 * agreement can mean outdated OSM, a misaligned image or a genuinely ambiguous
 * surface. Only the most useful contrasts are returned, never the whole map.
 */
export function computeOsmContrasts(
  labels: Uint8Array,
  width: number,
  height: number,
  ways: OsmWay[],
  sourceWidth: number,
  sourceHeight: number,
  options: OsmContrastOptions = {},
): ClassificationOsmContrast[] {
  const minAreaPx = options.minAreaPx ?? 48;
  const maxAgreement = options.maxAgreement ?? 65;
  const limit = options.limit ?? 40;
  if (!ways.length || width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return [];
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;
  const results: ClassificationOsmContrast[] = [];

  for (const way of ways) {
    const info = osmSemanticOf(way);
    if (!info.area || info.priorClass === 0 || !isClosedWay(way)) continue;
    const classId = info.priorClass;
    const classKey = CLASS_KEY[classId as 1 | 2 | 3 | 4];
    const rings: Point[][] = [];
    const outer = cleanRing(way.coords.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })));
    if (outer.length < 3) continue;
    rings.push(outer);
    for (const hole of way.holes ?? []) {
      const ring = cleanRing(hole.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })));
      if (ring.length >= 3) rings.push(ring);
    }

    let total = 0;
    let matched = 0;
    rasterizeRings(rings, width, height, (pixel) => {
      total++;
      if (labels[pixel] === classId) matched++;
    });
    if (total < minAreaPx) continue;
    const agreement = Math.round((matched / total) * 1000) / 10;
    if (agreement > maxAgreement) continue;
    const label = semanticLabel(info);
    results.push({
      osmId: way.id,
      name: way.name?.trim() || label,
      label,
      classKey,
      agreement,
      areaPx: total,
    });
  }

  return results
    .sort((a, b) => a.agreement - b.agreement || b.areaPx - a.areaPx)
    .slice(0, limit);
}
