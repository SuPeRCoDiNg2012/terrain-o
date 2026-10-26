import type { OsmWay } from '../model/types';

/**
 * Semantic interpretation of OSM tags for the fusion pipeline.
 *
 * OSM is a prior, never a verified statement: `priorClass` is the ISOM family
 * the classifier should favour when the imagery is ambiguous, and `featureType`
 * is the automatic cartographic element we can create directly from the OSM
 * geometry. Nothing here can produce `verified: true`.
 */
export type OsmSemantic =
  | 'building'
  | 'water'
  | 'wetland'
  | 'forest'
  | 'scrub'
  | 'open'
  | 'artificial'
  | 'road'
  | 'path'
  | 'stream'
  | 'railway'
  | 'barrier'
  | 'tree'
  | 'unknown';

export type OsmClassId = 0 | 1 | 2 | 3 | 4;

export interface OsmSemanticInfo {
  semantic: OsmSemantic;
  /** Whether the OSM element is a polygon (closed ring with holes). */
  area: boolean;
  /** Cartographic geometry this OSM element can produce. */
  featureKind: 'area' | 'line' | 'point' | null;
  /** Key in AREA_TYPES / LINE_TYPES, or null when OSM has no matching symbol. */
  featureType: string | null;
  /** ISOM family used by the classifier. 0 means "no prior". */
  priorClass: OsmClassId;
  /** 0..1 strength of the prior on its own footprint. */
  priorWeight: number;
  /** Width in source-image pixels used when rasterizing linear priors. */
  lineWidthPx: number;
}

const UNKNOWN: OsmSemanticInfo = {
  semantic: 'unknown',
  area: false,
  featureKind: null,
  featureType: null,
  priorClass: 0,
  priorWeight: 0,
  lineWidthPx: 0,
};

const FENCE_BARRIERS = new Set([
  'fence',
  'wall',
  'hedge',
  'hedge_bank',
  'retaining_wall',
  'city_wall',
  'guard_rail',
  'handrail',
]);

const HEDGE_BARRIERS = new Set(['hedge', 'hedge_bank']);
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
const PATH_HIGHWAYS = new Set([
  'path',
  'footway',
  'track',
  'bridleway',
  'cycleway',
  'steps',
  'corridor',
  'pedestrian',
]);
const WATER_AREAS = new Set(['water', 'bay', 'strait', 'reservoir', 'basin', 'swimming_pool']);
const FOREST_LANDUSE = new Set(['forest', 'orchard', 'vineyard', 'plant_nursery']);
const OPEN_LANDUSE = new Set(['meadow', 'grass', 'farmland', 'allotments', 'village_green']);
const OPEN_NATURAL = new Set([
  'grassland',
  'heath',
  'bare_rock',
  'scree',
  'sand',
  'beach',
  'shingle',
  'fell',
  'moor',
]);
const ARTIFICIAL_LANDUSE = new Set([
  'residential',
  'commercial',
  'industrial',
  'railway',
  'construction',
  'quarry',
  'landfill',
  'brownfield',
  'greenfield',
  'retail',
]);
const ARTIFICIAL_AMENITY = new Set([
  'school',
  'university',
  'college',
  'hospital',
  'clinic',
  'parking',
  'grave_yard',
  'prison',
]);
const ARTIFICIAL_LEISURE = new Set([
  'pitch',
  'playground',
  'sports_centre',
  'stadium',
  'track',
  'parking',
]);
const OPEN_LEISURE = new Set(['park', 'garden', 'common', 'nature_reserve', 'golf_course', 'cemetery']);

function tagsOf(way: OsmWay): Record<string, string> {
  const tags: Record<string, string> = { ...(way.tags ?? {}) };
  const fields: Array<keyof OsmWay> = [
    'highway',
    'waterway',
    'building',
    'landuse',
    'natural',
    'leisure',
    'amenity',
    'barrier',
    'railway',
  ];
  for (const field of fields) {
    const value = way[field];
    if (typeof value === 'string' && value) tags[field] = value;
  }
  return tags;
}

/** A ring is closed when the importer marked it or the last point repeats the first. */
export function isClosedWay(way: OsmWay): boolean {
  if (way.closed) return way.coords.length >= 3;
  if (way.coords.length < 4) return false;
  const first = way.coords[0];
  const last = way.coords[way.coords.length - 1];
  return Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
}

export function osmTags(way: OsmWay): Record<string, string> {
  return tagsOf(way);
}

export function osmSemanticOf(way: OsmWay): OsmSemanticInfo {
  if (way.kind === 'tree' || way.tags?.natural === 'tree') {
    return {
      semantic: 'tree',
      area: false,
      featureKind: 'point',
      featureType: 'tree',
      priorClass: 1,
      priorWeight: 0.2,
      lineWidthPx: 0,
    };
  }

  const tags = tagsOf(way);
  const closed = isClosedWay(way);
  const building = tags.building;
  const natural = tags.natural;
  const landuse = tags.landuse;
  const leisure = tags.leisure;
  const amenity = tags.amenity;
  const highway = tags.highway;
  const waterway = tags.waterway;
  const railway = tags.railway;
  const barrier = tags.barrier;

  if (building && building !== 'no') {
    return {
      semantic: 'building',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'building' : null,
      priorClass: 4,
      priorWeight: 0.9,
      lineWidthPx: 0,
    };
  }

  if (
    (natural && WATER_AREAS.has(natural)) ||
    (landuse && WATER_AREAS.has(landuse)) ||
    (leisure && WATER_AREAS.has(leisure)) ||
    waterway === 'riverbank' ||
    waterway === 'dock' ||
    waterway === 'boatyard'
  ) {
    return {
      semantic: 'water',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'water' : null,
      priorClass: 3,
      priorWeight: 0.85,
      lineWidthPx: 3,
    };
  }

  if (natural === 'wetland' || natural === 'marsh') {
    // Wetland is not open water. It gets a weaker water prior and no direct
    // water area feature, because the current symbol set has no accurate marsh
    // symbol and the project must not invent one.
    return {
      semantic: 'wetland',
      area: closed,
      featureKind: null,
      featureType: null,
      priorClass: 3,
      priorWeight: 0.38,
      lineWidthPx: 0,
    };
  }

  if (natural === 'wood' || (landuse && FOREST_LANDUSE.has(landuse))) {
    return {
      semantic: 'forest',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'forest' : null,
      priorClass: 1,
      priorWeight: 0.82,
      lineWidthPx: 0,
    };
  }

  if (natural === 'scrub') {
    return {
      semantic: 'scrub',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'thicket' : null,
      priorClass: 1,
      priorWeight: 0.7,
      lineWidthPx: 0,
    };
  }

  if (landuse && OPEN_LANDUSE.has(landuse)) {
    return {
      semantic: 'open',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'open' : null,
      priorClass: 2,
      priorWeight: 0.72,
      lineWidthPx: 0,
    };
  }

  if (natural && OPEN_NATURAL.has(natural)) {
    return {
      semantic: 'open',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'open' : null,
      priorClass: 2,
      priorWeight: 0.65,
      lineWidthPx: 0,
    };
  }

  if (leisure && OPEN_LEISURE.has(leisure)) {
    return {
      semantic: 'open',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'open' : null,
      priorClass: 2,
      priorWeight: 0.5,
      lineWidthPx: 0,
    };
  }

  if (
    (landuse && ARTIFICIAL_LANDUSE.has(landuse)) ||
    (amenity && ARTIFICIAL_AMENITY.has(amenity)) ||
    (leisure && ARTIFICIAL_LEISURE.has(leisure))
  ) {
    return {
      semantic: 'artificial',
      area: closed,
      featureKind: closed ? 'area' : null,
      featureType: closed ? 'artificial' : null,
      priorClass: 4,
      priorWeight: 0.68,
      lineWidthPx: 0,
    };
  }

  if (highway === 'pedestrian' && closed) {
    return {
      semantic: 'artificial',
      area: true,
      featureKind: 'area',
      featureType: 'artificial',
      priorClass: 4,
      priorWeight: 0.6,
      lineWidthPx: 0,
    };
  }

  if (highway && PATH_HIGHWAYS.has(highway)) {
    return {
      semantic: 'path',
      area: false,
      featureKind: 'line',
      featureType: 'path',
      priorClass: 4,
      priorWeight: 0.24,
      lineWidthPx: 2.5,
    };
  }

  if (highway && ROAD_HIGHWAYS.has(highway)) {
    return {
      semantic: 'road',
      area: false,
      featureKind: 'line',
      featureType: 'road',
      priorClass: 4,
      priorWeight: 0.5,
      lineWidthPx: 8,
    };
  }

  if (waterway) {
    return {
      semantic: 'stream',
      area: false,
      featureKind: 'line',
      featureType: 'stream',
      priorClass: 3,
      priorWeight: 0.58,
      lineWidthPx: 2.8,
    };
  }

  if (railway === 'platform' && closed) {
    return {
      semantic: 'artificial',
      area: true,
      featureKind: 'area',
      featureType: 'artificial',
      priorClass: 4,
      priorWeight: 0.6,
      lineWidthPx: 0,
    };
  }

  if (railway) {
    return {
      semantic: 'railway',
      area: false,
      featureKind: null,
      featureType: null,
      priorClass: 4,
      priorWeight: 0.28,
      lineWidthPx: 4,
    };
  }

  if (barrier && FENCE_BARRIERS.has(barrier)) {
    const hedge = HEDGE_BARRIERS.has(barrier);
    return {
      semantic: 'barrier',
      area: false,
      featureKind: 'line',
      featureType: 'fence',
      priorClass: hedge ? 1 : 4,
      priorWeight: hedge ? 0.3 : 0.2,
      lineWidthPx: 1.5,
    };
  }

  return UNKNOWN;
}

/** True when this OSM way should be used to build a classifier prior. */
export function hasPrior(info: OsmSemanticInfo): boolean {
  return info.priorClass !== 0 && info.priorWeight > 0;
}

/** Short Italian label used by counts in the OSM panel. */
export function semanticLabel(info: OsmSemanticInfo): string {
  switch (info.semantic) {
    case 'building':
      return 'Edifici';
    case 'water':
      return 'Acqua';
    case 'wetland':
      return 'Aree umide';
    case 'forest':
      return 'Bosco';
    case 'scrub':
      return 'Arbusti';
    case 'open':
      return 'Aree aperte';
    case 'artificial':
      return 'Superfici artificiali';
    case 'road':
      return 'Strade';
    case 'path':
      return 'Sentieri';
    case 'stream':
      return "Corsi d'acqua";
    case 'railway':
      return 'Ferrovie';
    case 'barrier':
      return 'Barriere';
    case 'tree':
      return 'Alberi';
    default:
      return 'Altro';
  }
}
