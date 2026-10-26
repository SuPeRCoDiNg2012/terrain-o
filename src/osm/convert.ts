import type { Feature, OsmWay, Point } from '../model/types';
import { createFeature, typeSpec } from '../model/constants';
import { isClosedWay, osmSemanticOf, semanticLabel, type OsmSemantic, type OsmSemanticInfo } from './semantic';

function cleanRing(points: Point[]): Point[] {
  if (points.length < 3) return [];
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) return points.slice(0, -1);
  return points.slice();
}

/** The cartographic type OSM can produce for this element, if any. */
export function osmTypeFor(way: OsmWay): string | null {
  return osmSemanticOf(way).featureType;
}

/**
 * One OSM element becomes one automatic feature. Areas keep their holes (a
 * building courtyard, a forest clearing) and never become verified.
 */
export function osmFeatureFor(way: OsmWay): Feature | null {
  const info = osmSemanticOf(way);
  if (!info.featureKind || !info.featureType) return null;
  if (info.featureKind === 'area' && !isClosedWay(way)) return null;

  if (info.featureKind === 'point') {
    const point = way.coords[0];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return createFeature('point', info.featureType, [{ x: point.x, y: point.y }], {
      source: 'osm',
      osmId: way.id,
      name: way.name?.trim() || 'Albero isolato OSM',
      notes: 'Nodo albero di OpenStreetMap; posizione automatica non verificata.',
      verified: false,
    });
  }

  const coords =
    info.featureKind === 'area' ? cleanRing(way.coords) : way.coords.map((point) => ({ ...point }));
  if (info.featureKind === 'area' ? coords.length < 3 : coords.length < 2) return null;

  const holes =
    info.featureKind === 'area'
      ? (way.holes ?? []).map(cleanRing).filter((ring) => ring.length >= 3)
      : [];
  const label = typeSpec(info.featureType).defaultName;
  return createFeature(info.featureKind, info.featureType, coords, {
    source: 'osm',
    osmId: way.id,
    name: way.name?.trim() || `${label} OSM`,
    notes: 'Da OpenStreetMap; geometria automatica non verificata.',
    verified: false,
    ...(holes.length ? { holes } : {}),
  });
}

/**
 * Creates features for every OSM element that has a matching cartridge type.
 * Existing OSM features with the same `osmId` are left untouched, so a manual
 * correction or a verification is never overwritten by a re-import.
 */
export function osmWaysToFeatures(ways: OsmWay[], existing: Feature[]): Feature[] {
  const keyOf = (osmId: number, type: string) => `${osmId}:${type}`;
  const known = new Set(
    existing
      .filter((feature) => feature.source === 'osm' && feature.osmId != null)
      .map((feature) => keyOf(feature.osmId as number, feature.type)),
  );
  const added: Feature[] = [];
  for (const way of ways) {
    const feature = osmFeatureFor(way);
    if (!feature) continue;
    // Node and way ids live in separate OSM namespaces, so the key includes
    // the produced symbol type as well as the numeric id.
    const key = keyOf(way.id, feature.type);
    if (known.has(key)) continue;
    known.add(key);
    added.push(feature);
  }
  return added;
}

export function mergeOsmWays(existing: OsmWay[], incoming: OsmWay[]): OsmWay[] {
  const map = new Map<number, OsmWay>();
  for (const way of existing) map.set(way.id, way);
  for (const way of incoming) map.set(way.id, way);
  return [...map.values()];
}

export interface OsmFusionSummary {
  total: number;
  areas: number;
  lines: number;
  trees: number;
  convertible: number;
  counts: Array<{ semantic: OsmSemantic; label: string; count: number; convertible: boolean }>;
}

/** Counts used by the OSM panel before running the fusion. */
export function summarizeOsmWays(ways: OsmWay[]): OsmFusionSummary {
  const counts = new Map<OsmSemantic, { label: string; count: number; convertible: boolean }>();
  let areas = 0;
  let lines = 0;
  let trees = 0;
  let convertible = 0;
  for (const way of ways) {
    const info: OsmSemanticInfo = osmSemanticOf(way);
    const current = counts.get(info.semantic) ?? {
      label: semanticLabel(info),
      count: 0,
      convertible: Boolean(info.featureType),
    };
    current.count++;
    current.convertible ||= Boolean(info.featureType);
    counts.set(info.semantic, current);
    if (info.semantic === 'tree') trees++;
    else if (info.area) areas++;
    else lines++;
    if (info.featureType) convertible++;
  }
  return {
    total: ways.length,
    areas,
    lines,
    trees,
    convertible,
    counts: [...counts.entries()]
      .map(([semantic, value]) => ({ semantic, ...value }))
      .sort((a, b) => b.count - a.count),
  };
}
