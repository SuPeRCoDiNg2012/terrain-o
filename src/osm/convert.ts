import type { Feature, OsmWay } from '../model/types';
import { createFeature } from '../model/constants';

const PATH_HIGHWAYS = new Set(['path', 'footway', 'track', 'bridleway', 'cycleway', 'steps', 'corridor']);
const ROAD_HIGHWAYS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'trunk',
  'motorway',
  'residential',
  'service',
  'unclassified',
  'living_street',
  'road',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);

export function osmTypeFor(way: OsmWay): 'path' | 'road' | 'stream' | null {
  if (way.kind === 'waterway') return 'stream';
  const highway = way.highway ?? '';
  if (PATH_HIGHWAYS.has(highway)) return 'path';
  if (ROAD_HIGHWAYS.has(highway)) return 'road';
  return null;
}

export function osmWaysToFeatures(ways: OsmWay[], existing: Feature[]): Feature[] {
  const known = new Set(
    existing
      .filter((feature) => feature.source === 'osm' && feature.osmId != null)
      .map((feature) => feature.osmId as number),
  );
  const added: Feature[] = [];
  for (const way of ways) {
    if (known.has(way.id)) continue;
    const type = osmTypeFor(way);
    if (!type) continue;
    known.add(way.id);
    const feature = createFeature('line', type, way.coords, {
      source: 'osm',
      osmId: way.id,
      name: way.name?.trim() || (type === 'path' ? 'Sentiero OSM' : type === 'road' ? 'Strada OSM' : 'Ruscello OSM'),
    });
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
