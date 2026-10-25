import type { Point, Project } from '../model/types';
import { metersPerPixel, pixelToWgs84 } from '../geo/projection';
import type { PolygonalRegion } from './types';
import { validateRegions } from './topology';

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    class: number;
    classLabel: string;
    confidence: number;
    provenance: 'auto';
    areaPx: number;
    areaM2?: number;
  };
}

export interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
  metadata: {
    coordinateSystem: 'wgs84' | 'pixel';
    note: string;
  };
}

function area(points: number[][]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

const CLASS_LABELS: Record<number, string> = {
  1: 'Vegetazione (sperimentale)',
  2: 'Terreno aperto (sperimentale)',
  3: 'Acqua (sperimentale)',
  4: 'Superficie artificiale (sperimentale)',
};

/**
 * Converts vectorized regions to GeoJSON. Every property says provenance "auto"
 * and there is no path that can emit "verified": verification is a user act on
 * a project feature, never a classifier output.
 */
export function regionsToGeoJson(
  regions: PolygonalRegion[],
  options: { project?: Project | null; scale?: number } = {},
): GeoJsonCollection {
  const problems = validateRegions(regions);
  if (problems.length) {
    throw new Error(`Topologia non valida (${problems.length} problemi): ${problems[0]}`);
  }

  const { project, scale = 1 } = options;
  const mpp = project ? metersPerPixel(project) : null;
  const georeferenced = Boolean(project && project.worldFile && project.image);
  const toCoord = (point: Point): number[] => {
    if (georeferenced && project) {
      const geo = pixelToWgs84(project, { x: point.x * scale, y: point.y * scale });
      return geo ? [geo[0], geo[1]] : [point.x * scale, point.y * scale];
    }
    return [point.x * scale, point.y * scale];
  };

  const normalize = (ring: Point[], positive: boolean): number[][] => {
    const coordinates = ring.map(toCoord);
    const signed = area(coordinates);
    if ((signed > 0) !== positive) coordinates.reverse();
    coordinates.push(coordinates[0]);
    return coordinates;
  };

  const features: GeoJsonFeature[] = regions.map((region) => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        normalize(region.coords, true),
        ...region.holes.map((hole) => normalize(hole, false)),
      ],
    },
    properties: {
      class: region.classId,
      classLabel: CLASS_LABELS[region.classId] ?? 'Non classificato',
      confidence: Math.round(region.confidence * 1000) / 1000,
      provenance: 'auto',
      areaPx: Math.round(region.area),
      ...(mpp && georeferenced ? { areaM2: Math.round(region.area * scale * scale * mpp * mpp) } : {}),
    },
  }));

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      coordinateSystem: georeferenced ? 'wgs84' : 'pixel',
      note: georeferenced
        ? 'Geometrie automatiche in WGS84. Materia prima sperimentale, non verificata.'
        : 'Geometrie automatiche in pixel dell’immagine sorgente: nessuna georeferenziazione disponibile.',
    },
  };
}
