import proj4 from 'proj4';
import type { BBox, ContourLine, Feature, Point, Project, WorldFile } from '../model/types';
import { worldFileUnits, worldToPixel } from './worldfile';

const WGS84 = 'EPSG:4326';

export class ProjectionError extends Error {}

export interface GeoreferenceResult {
  imageBBox: BBox | null;
  projectionSource: Project['projectionSource'];
  warnings: string[];
}

export function validateWKT(wkt: string): { ok: boolean; error?: string } {
  try {
    const converter = proj4(wkt, WGS84);
    const result = converter.forward([11.5, 46.5]);
    if (!Number.isFinite(result[0]) || !Number.isFinite(result[1])) {
      return { ok: false, error: 'La proiezione non produce coordinate finite.' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function isGeographicWKT(wkt: string): boolean {
  try {
    // proj4 exposes the source projection through the converter object.
    const converter = proj4(wkt, WGS84) as unknown as { oProj?: { projName?: string } };
    return converter.oProj?.projName === 'longlat';
  } catch {
    return false;
  }
}

/**
 * Builds a WGS84 bbox from the four image corners. A missing projection is only
 * assumed to be WGS84 when the world file uses degrees; projecting metre
 * coordinates through an unknown CRS would produce a dangerously wrong map.
 */
export function buildGeoreference(
  wf: WorldFile | null,
  wkt: string | null,
  width: number,
  height: number,
): GeoreferenceResult {
  const warnings: string[] = [];
  if (!wf) {
    return { imageBBox: null, projectionSource: 'none', warnings };
  }
  const units = worldFileUnits(wf);
  let source = wkt?.trim() ?? '';
  let projectionSource: Project['projectionSource'] = 'none';

  if (source) {
    const valid = validateWKT(source);
    if (!valid.ok) {
      warnings.push(
        `Il file .prj non è leggibile (${valid.error ?? 'WKT non valido'}); georeferenziazione non calcolata.`,
      );
      return { imageBBox: null, projectionSource: 'none', warnings };
    }
    if (units === 'degrees' && !isGeographicWKT(source)) {
      warnings.push(
        'World file in gradi con una proiezione metrica: incoerenza rilevata. Coordinate trattate come WGS84.',
      );
      projectionSource = 'degrees';
      source = '';
    } else {
      projectionSource = 'wkt';
    }
  } else if (units === 'degrees') {
    projectionSource = 'assumed-wgs84';
    warnings.push('Nessun file .prj: proiezione assunta EPSG:4326 (WGS84). Verificare la georeferenziazione.');
  } else {
    warnings.push(
      'World file in unità metriche senza .prj: proiezione sconosciuta. Misure in pixel, nessuna georeferenziazione WGS84.',
    );
    return { imageBBox: null, projectionSource: 'none', warnings };
  }

  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([x, y]) => cornerToLonLat(wf, x, y, source, units));
  if (corners.some((c) => !c)) {
    warnings.push('Le coordinate del world file non ricadono in un intervallo geografico valido.');
    return { imageBBox: null, projectionSource: 'none', warnings };
  }
  const valid = corners as Array<[number, number]>;
  const lons = valid.map((c) => c[0]);
  const lats = valid.map((c) => c[1]);
  const imageBBox = {
    west: Math.min(...lons),
    south: Math.min(...lats),
    east: Math.max(...lons),
    north: Math.max(...lats),
  };
  if (!bboxIsValid(imageBBox)) {
    warnings.push('Il bbox calcolato non è valido: georeferenziazione ignorata.');
    return { imageBBox: null, projectionSource: 'none', warnings };
  }
  return { imageBBox, projectionSource, warnings };
}

function cornerToLonLat(
  wf: WorldFile,
  x: number,
  y: number,
  wkt: string,
  units: 'degrees' | 'meters',
): [number, number] | null {
  const world = {
    x: wf.A * x + wf.B * y + wf.C,
    y: wf.D * x + wf.E * y + wf.F,
  };
  let lon: number;
  let lat: number;
  if (!wkt || units === 'degrees') {
    lon = world.x;
    lat = world.y;
  } else {
    try {
      const [a, b] = proj4(wkt, WGS84).forward([world.x, world.y]);
      lon = a;
      lat = b;
    } catch {
      return null;
    }
  }
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180.001 || lon > 180.001 || lat < -90.001 || lat > 90.001) return null;
  return [lon, lat];
}

export function bboxIsValid(bbox: BBox): boolean {
  return (
    Number.isFinite(bbox.west) &&
    Number.isFinite(bbox.east) &&
    Number.isFinite(bbox.south) &&
    Number.isFinite(bbox.north) &&
    bbox.west < bbox.east &&
    bbox.south < bbox.north &&
    bbox.west >= -180 &&
    bbox.east <= 180 &&
    bbox.south >= -90 &&
    bbox.north <= 90
  );
}

export function pixelToWgs84(project: Project, p: Point): [number, number] | null {
  if (!project.worldFile || !project.image) return null;
  const w = {
    x: project.worldFile.A * p.x + project.worldFile.B * p.y + project.worldFile.C,
    y: project.worldFile.D * p.x + project.worldFile.E * p.y + project.worldFile.F,
  };
  try {
    if (!project.projectionWKT || project.projectionSource === 'degrees' || project.projectionSource === 'assumed-wgs84') {
      return [w.x, w.y];
    }
    if (project.projectionSource === 'wkt') {
      const [lon, lat] = proj4(project.projectionWKT, WGS84).forward([w.x, w.y]);
      return [lon, lat];
    }
  } catch {
    return null;
  }
  return null;
}

export function wgs84ToPixel(project: Project, lon: number, lat: number): Point | null {
  const wf = project.worldFile;
  if (!wf) return null;
  const units = worldFileUnits(wf);
  let worldX = lon;
  let worldY = lat;
  if (project.projectionSource === 'wkt' && project.projectionWKT && units === 'meters') {
    try {
      const [x, y] = proj4(WGS84, project.projectionWKT).forward([lon, lat]);
      worldX = x;
      worldY = y;
    } catch {
      return null;
    }
  }
  try {
    return worldToPixel(wf, worldX, worldY);
  } catch {
    return null;
  }
}

export function wgs84ToMercator(lon: number, lat: number): [number, number] {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lon * 20037508.342789244) / 180;
  const y = (Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) * 20037508.342789244) / Math.PI;
  return [x, y];
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function metersPerPixel(project: Project): number | null {
  if (project.calibration && project.calibration.mPerPx > 0) return project.calibration.mPerPx;
  if (!project.image || !project.worldFile || !project.imageBBox) return null;
  const a = pixelToWgs84(project, { x: 0, y: 0 });
  const b = pixelToWgs84(project, { x: project.image.width, y: 0 });
  if (!a || !b) return null;
  const meters = haversineMeters(a, b);
  if (!Number.isFinite(meters) || meters <= 1e-6) return null;
  return meters / project.image.width;
}

export function polylineLengthPx(coords: Point[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += Math.hypot(coords[i].x - coords[i - 1].x, coords[i].y - coords[i - 1].y);
  }
  return total;
}

export function distanceBetween(project: Project, a: Point, b: Point): number | null {
  const scale = metersPerPixel(project);
  if (scale) return Math.hypot(b.x - a.x, b.y - a.y) * scale;
  const wa = pixelToWgs84(project, a);
  const wb = pixelToWgs84(project, b);
  if (wa && wb) return haversineMeters(wa, wb);
  return null;
}

export function featureLengthMeters(project: Project, feature: Feature): number | null {
  const coords = feature.kind === 'area' && feature.coords.length > 2 ? [...feature.coords, feature.coords[0]] : feature.coords;
  if (!coords.length) return null;
  const scale = metersPerPixel(project);
  if (scale) return polylineLengthPx(coords) * scale;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = pixelToWgs84(project, coords[i - 1]);
    const b = pixelToWgs84(project, coords[i]);
    if (!a || !b) return null;
    total += haversineMeters(a, b);
  }
  return total;
}

export function polygonAreaPx(coords: Point[]): number {
  if (coords.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function featureAreaMeters(project: Project, feature: Feature): number | null {
  if (feature.kind !== 'area' || feature.coords.length < 3) return null;
  const scale = metersPerPixel(project);
  if (!scale) return null;
  let area = polygonAreaPx(feature.coords);
  for (const hole of feature.holes ?? []) area -= polygonAreaPx(hole);
  return Math.max(0, area) * scale * scale;
}

export function courseRoute(project: Project): Array<Point & { feature: Feature }> {
  const points = project.features
    .filter((f) => f.kind === 'point' && ['start', 'control', 'finish'].includes(f.type))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return points.map((feature) => ({ ...feature.coords[0], feature }));
}

export function courseLengthMeters(project: Project): number | null {
  const route = courseRoute(project);
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const d = distanceBetween(project, route[i - 1], route[i]);
    if (d == null) return null;
    total += d;
  }
  return total;
}

export function contoursBBox(contours: ContourLine[]): BBox | null {
  const points = contours.flatMap((c) => c.coords);
  if (!points.length) return null;
  return {
    west: Math.min(...points.map((p) => p.x)),
    south: Math.min(...points.map((p) => p.y)),
    east: Math.max(...points.map((p) => p.x)),
    north: Math.max(...points.map((p) => p.y)),
  };
}

export function formatMeters(m: number | null): string {
  if (m == null) return '— px';
  if (m < 1000) return `${m.toFixed(m < 10 ? 2 : 1)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function formatCoord(n: number, digits = 6): string {
  return n.toFixed(digits);
}
