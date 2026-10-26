import type { Point, Project } from '../model/types';
import { typeSpec, PRELIMINARY_WARNING } from '../model/constants';
import { featureAreaMeters, pixelToWgs84 } from '../geo/projection';
import { featureProvenance } from '../render/provenance';
import { assertProjectTopology } from './topologyCheck';

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

function closeRing(ring: Point[]): Point[] {
  if (ring.length < 2) return ring;
  return samePoint(ring[0], ring[ring.length - 1]) ? ring : [...ring, ring[0]];
}

function signedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function orientRing(ring: number[][], counterClockwise: boolean): number[][] {
  const closed = [...ring];
  if (closed.length && (closed[0][0] !== closed[closed.length - 1][0] || closed[0][1] !== closed[closed.length - 1][1])) {
    closed.push([...closed[0]]);
  }
  const area = signedArea(closed);
  if ((area > 0) !== counterClockwise) closed.reverse();
  return closed;
}

export function exportProjectGeoJson(project: Project): string {
  assertProjectTopology(project, 'GeoJSON');
  const featuresWithGeometry = project.features.filter((f) => f.coords.length > 0);
  const georeferenced = Boolean(project.imageBBox) && featuresWithGeometry.every((feature) =>
    [feature.coords, ...(feature.holes ?? [])].every((ring) => ring.every((p) => pixelToWgs84(project, p) != null)),
  );

  const toCoords = (p: Point): number[] => {
    if (georeferenced) {
      const ll = pixelToWgs84(project, p);
      if (!ll) throw new Error('Conversione geografica non disponibile durante l\'export GeoJSON.');
      return [round(ll[0], 7), round(ll[1], 7)];
    }
    return [round(p.x, 3), round(p.y, 3)];
  };

  const geoFeatures: Array<Record<string, unknown>> = [];
  for (const feature of featuresWithGeometry) {
    const spec = typeSpec(feature.type);
    let geometry: Record<string, unknown> | null = null;
    if (feature.kind === 'point') {
      geometry = { type: 'Point', coordinates: toCoords(feature.coords[0]) };
    } else if (feature.kind === 'line') {
      geometry = { type: 'LineString', coordinates: feature.coords.map(toCoords) };
    } else {
      const outer = orientRing(closeRing(feature.coords).map(toCoords), true);
      const holes = (feature.holes ?? []).map((hole) => orientRing(closeRing(hole).map(toCoords), false));
      geometry = { type: 'Polygon', coordinates: [outer, ...holes] };
    }
    const areaM2 = feature.kind === 'area' && georeferenced ? featureAreaMeters(project, feature) : null;
    geoFeatures.push({
      type: 'Feature',
      id: feature.id,
      geometry,
      properties: {
        id: feature.id,
        kind: feature.kind,
        type: feature.type,
        // `class` and `classLabel` mirror the vectorize/export bridge so GIS
        // tools that read the automatic output also read this project export.
        class: feature.type,
        classLabel: spec.label,
        typeLabel: spec.label,
        isomCode: spec.isomCode ?? null,
        provenance: featureProvenance(feature),
        ...(areaM2 != null ? { areaM2: Math.round(areaM2) } : {}),
        name: feature.name,
        notes: feature.notes,
        verified: feature.verified,
        verifiedNote: feature.verifiedNote,
        verificationHistory: feature.history,
        source: feature.source ?? 'manual',
        osmId: feature.osmId ?? null,
        ...(feature.mlConfidence != null ? { mlConfidence: round(feature.mlConfidence, 3) } : {}),
        ...(feature.mergedFrom?.length ? { mergedFrom: feature.mergedFrom } : {}),
        code: feature.code ?? null,
        order: feature.order ?? null,
      },
    });
  }

  const output = {
    type: 'FeatureCollection',
    name: project.name,
    features: geoFeatures,
    terrainO: {
      schema: project.schema,
      exportedAt: new Date().toISOString(),
      georeferenced,
      coordinateReferenceSystem: georeferenced ? 'EPSG:4326 (WGS84, longitudine/latitudine)' : 'pixel immagine (origine in alto a sinistra)',
      projectionSource: project.projectionSource,
      imageBBox: project.imageBBox,
      image: project.image
        ? { name: project.image.name, width: project.image.width, height: project.image.height }
        : null,
      printScale: project.printScale,
      disclaimer: PRELIMINARY_WARNING,
      warning: georeferenced
        ? 'Bozza preliminare: nessuna garanzia di percorribilità, vegetazione sotto copertura, sicurezza o conformità IOF.'
        : 'Coordinate in pixel: il progetto non è georeferenziato in WGS84. Non usare questo file come overlay geografico.',
    },
  };
  return JSON.stringify(output, null, 2);
}
