import { describe, expect, it } from 'vitest';
import type { OsmWay } from '../model/types';
import { buildOsmApiUrl, buildOverpassQuery, parseOsmApiXml, parseOverpassElements } from './client';
import { mergeOsmWays, osmFeatureFor, osmWaysToFeatures, summarizeOsmWays } from './convert';
import { buildOsmPriorMap } from './priorMap';
import { isClosedWay, osmSemanticOf } from './semantic';

function ring(points: Array<[number, number]>): Array<{ x: number; y: number }> {
  const coords = points.map(([x, y]) => ({ x, y }));
  if (coords.length) coords.push({ ...coords[0] });
  return coords;
}

function way(partial: Partial<OsmWay> & Pick<OsmWay, 'id' | 'kind' | 'coords'>): OsmWay {
  return { ...partial };
}

describe('buildOverpassQuery', () => {
  it('uses valid syntax, covers all fusion layers and includes south/west/north/east bounds', () => {
    const query = buildOverpassQuery({ west: 11.5, south: 46.5, east: 11.55, north: 46.52 });
    expect(query).toContain('[out:json]');
    expect(query).toContain('46.500000,11.500000,46.520000,11.550000');
    expect(query).toContain('out body geom;');
    expect(query).not.toContain('out geom tags');
    for (const selector of [
      'way["highway"]',
      'way["waterway"]',
      'way["building"]',
      'way["landuse"]',
      'way["natural"]',
      'way["leisure"]',
      'way["amenity"]',
      'way["barrier"]',
      'way["railway"]',
      'relation["building"]',
      'node["natural"="tree"]',
    ]) {
      expect(query).toContain(selector);
    }
  });
});

describe('OSM API fallback', () => {
  it('builds a west,south,east,north bbox URL', () => {
    const url = buildOsmApiUrl({ west: 11.5, south: 46.5, east: 11.55, north: 46.52 });
    expect(url).toContain('bbox=11.500000,46.500000,11.550000,46.520000');
  });

  it('parses nodes, land use, buildings and trees', () => {
    const xml = `<?xml version="1.0"?><osm version="0.6">
      <node id="1" lat="46.5" lon="11.5"/>
      <node id="2" lat="46.501" lon="11.501"/>
      <node id="3" lat="46.5001" lon="11.5001"><tag k="natural" v="tree"/></node>
      <node id="4" lat="46.5000" lon="11.5000"/>
      <node id="5" lat="46.5000" lon="11.5002"/>
      <node id="6" lat="46.5002" lon="11.5002"/>
      <node id="7" lat="46.5002" lon="11.5000"/>
      <way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="track"/><tag k="name" v="Strada bianca"/></way>
      <way id="11"><nd ref="1"/><nd ref="2"/><tag k="landuse" v="forest"/></way>
      <way id="12"><nd ref="4"/><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="4"/><tag k="building" v="yes"/></way>
    </osm>`;
    const ways = parseOsmApiXml(xml);
    expect(ways).toHaveLength(4);
    expect(ways[0]).toMatchObject({ id: 10, kind: 'highway', name: 'Strada bianca', tags: { highway: 'track' } });
    expect(ways[0].geometry).toEqual([
      { lat: 46.5, lon: 11.5 },
      { lat: 46.501, lon: 11.501 },
    ]);
    expect(ways[1]).toMatchObject({ id: 11, kind: 'landuse', tags: { landuse: 'forest' } });
    expect(ways[2]).toMatchObject({ id: 12, kind: 'building', closed: true });
    expect(ways[3]).toMatchObject({ id: 3, kind: 'tree' });
    expect(ways[3].geometry).toHaveLength(1);
  });
});

describe('Overpass multipolygon parsing', () => {
  it('assembles relation outer and inner members into one closed area with a hole', () => {
    const outerA = [
      { lat: 46.5, lon: 11.5 },
      { lat: 46.5, lon: 11.502 },
    ];
    const outerB = [
      { lat: 46.5, lon: 11.502 },
      { lat: 46.502, lon: 11.502 },
      { lat: 46.502, lon: 11.5 },
      { lat: 46.5, lon: 11.5 },
    ];
    const inner = [
      { lat: 46.5005, lon: 11.5005 },
      { lat: 46.5005, lon: 11.5015 },
      { lat: 46.5015, lon: 11.5015 },
      { lat: 46.5015, lon: 11.5005 },
      { lat: 46.5005, lon: 11.5005 },
    ];
    const ways = parseOverpassElements([
      {
        type: 'relation',
        id: 900,
        tags: { type: 'multipolygon', building: 'yes' },
        members: [
          { type: 'way', ref: 1, role: 'outer', geometry: outerA },
          { type: 'way', ref: 2, role: 'outer', geometry: outerB },
          { type: 'way', ref: 3, role: 'inner', geometry: inner },
        ],
      },
      { type: 'node', id: 5, lat: 46.501, lon: 11.501, tags: { natural: 'tree' } },
    ]);
    expect(ways).toHaveLength(2);
    expect(ways[0]).toMatchObject({ kind: 'building', closed: true, id: -900001 });
    expect(ways[0].geometry).toHaveLength(5);
    expect(ways[0].holes).toHaveLength(1);
    expect(ways[1]).toMatchObject({ id: 5, kind: 'tree' });
  });
});

describe('OSM semantic fusion', () => {
  it('recognises buildings, water, forest, open ground and artificial surfaces', () => {
    expect(
      osmSemanticOf(
        way({ id: 1, kind: 'building', building: 'yes', tags: { building: 'yes' }, coords: ring([[0, 0], [10, 0], [10, 10], [0, 10]]) }),
      ),
    ).toMatchObject({ semantic: 'building', area: true, featureType: 'building', priorClass: 4 });
    expect(
      osmSemanticOf(
        way({ id: 2, kind: 'natural', natural: 'water', tags: { natural: 'water' }, coords: ring([[0, 0], [10, 0], [10, 10], [0, 10]]) }),
      ),
    ).toMatchObject({ semantic: 'water', featureType: 'water', priorClass: 3 });
    expect(
      osmSemanticOf(
        way({ id: 3, kind: 'landuse', landuse: 'forest', tags: { landuse: 'forest' }, coords: ring([[0, 0], [10, 0], [10, 10], [0, 10]]) }),
      ),
    ).toMatchObject({ semantic: 'forest', featureType: 'forest', priorClass: 1 });
    expect(
      osmSemanticOf(
        way({ id: 4, kind: 'leisure', leisure: 'park', tags: { leisure: 'park' }, coords: ring([[0, 0], [10, 0], [10, 10], [0, 10]]) }),
      ),
    ).toMatchObject({ semantic: 'open', featureType: 'open', priorClass: 2 });
    expect(
      osmSemanticOf(
        way({ id: 5, kind: 'landuse', landuse: 'residential', tags: { landuse: 'residential' }, coords: ring([[0, 0], [10, 0], [10, 10], [0, 10]]) }),
      ),
    ).toMatchObject({ semantic: 'artificial', featureType: 'artificial', priorClass: 4 });
  });

  it('distinguishes roads, paths, streams, barriers, railways and trees', () => {
    expect(osmSemanticOf(way({ id: 1, kind: 'highway', highway: 'primary', coords: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }))).toMatchObject({
      semantic: 'road',
      featureType: 'road',
      area: false,
    });
    expect(osmSemanticOf(way({ id: 2, kind: 'highway', highway: 'footway', coords: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }))).toMatchObject({
      semantic: 'path',
      featureType: 'path',
    });
    expect(osmSemanticOf(way({ id: 3, kind: 'waterway', waterway: 'stream', coords: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }))).toMatchObject({
      semantic: 'stream',
      featureType: 'stream',
    });
    expect(osmSemanticOf(way({ id: 4, kind: 'barrier', barrier: 'hedge', coords: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }))).toMatchObject({
      semantic: 'barrier',
      featureType: 'fence',
      priorClass: 1,
    });
    expect(osmSemanticOf(way({ id: 5, kind: 'railway', railway: 'rail', coords: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }))).toMatchObject({
      semantic: 'railway',
      featureType: null,
      priorClass: 4,
    });
    expect(osmSemanticOf(way({ id: 6, kind: 'tree', natural: 'tree', coords: [{ x: 4, y: 4 }] }))).toMatchObject({
      semantic: 'tree',
      featureKind: 'point',
      featureType: 'tree',
      priorClass: 1,
    });
    expect(
      osmSemanticOf(way({ id: 7, kind: 'highway', highway: 'pedestrian', coords: ring([[0, 0], [10, 0], [10, 10], [0, 10]]) })),
    ).toMatchObject({ semantic: 'artificial', area: true, featureType: 'artificial' });
  });

  it('detects closed rings with or without the repeated last vertex', () => {
    expect(isClosedWay(way({ id: 1, kind: 'building', coords: ring([[0, 0], [10, 0], [10, 10]]) }))).toBe(true);
    expect(
      isClosedWay(way({ id: 2, kind: 'building', coords: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] })),
    ).toBe(false);
  });
});

describe('OSM automatic features', () => {
  const footway = way({
    id: 42,
    kind: 'highway',
    highway: 'footway',
    name: 'Sentiero test',
    coords: [
      { x: 10, y: 10 },
      { x: 50, y: 40 },
    ],
  });

  it('converts footways to path features with OSM provenance', () => {
    const features = osmWaysToFeatures([footway], []);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      kind: 'line',
      type: 'path',
      source: 'osm',
      osmId: 42,
      name: 'Sentiero test',
      verified: false,
    });
  });

  it('converts a building with a courtyard into an area with a hole', () => {
    const building = way({
      id: 100,
      kind: 'building',
      building: 'yes',
      coords: ring([[0, 0], [40, 0], [40, 40], [0, 40]]),
      holes: [ring([[10, 10], [30, 10], [30, 30], [10, 30]])],
    });
    const feature = osmFeatureFor(building);
    expect(feature).toMatchObject({ kind: 'area', type: 'building', source: 'osm', osmId: 100, verified: false });
    expect(feature?.coords).toHaveLength(4);
    expect(feature?.holes).toHaveLength(1);
    expect(feature?.holes?.[0]).toHaveLength(4);
  });

  it('converts OSM tree nodes to tree points and does not duplicate OSM ids', () => {
    const tree = way({ id: 7, kind: 'tree', natural: 'tree', coords: [{ x: 4, y: 4 }] });
    expect(osmFeatureFor(tree)).toMatchObject({
      kind: 'point',
      type: 'tree',
      source: 'osm',
      osmId: 7,
      verified: false,
    });
    const first = osmWaysToFeatures([footway], []);
    const second = osmWaysToFeatures([footway], first);
    expect(second).toHaveLength(0);
  });

  it('keeps a tree node and a way that share the same numeric OSM id', () => {
    const tree = way({ id: 42, kind: 'tree', natural: 'tree', coords: [{ x: 1, y: 1 }] });
    const path = way({
      id: 42,
      kind: 'highway',
      highway: 'path',
      coords: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    });
    const features = osmWaysToFeatures([tree, path], []);
    expect(features).toHaveLength(2);
    expect(features.map((feature) => feature.type).sort()).toEqual(['path', 'tree']);
  });

  it('summarises available fusion data', () => {
    const building = way({
      id: 1,
      kind: 'building',
      building: 'yes',
      coords: ring([[0, 0], [10, 0], [10, 10], [0, 10]]),
    });
    const tree = way({ id: 2, kind: 'tree', natural: 'tree', coords: [{ x: 1, y: 1 }] });
    const summary = summarizeOsmWays([building, tree, footway]);
    expect(summary).toMatchObject({ total: 3, areas: 1, lines: 1, trees: 1, convertible: 3 });
    expect(summary.counts.find((item) => item.semantic === 'building')?.count).toBe(1);
  });

  it('merges repeated downloads by OSM id', () => {
    const renamed = { ...footway, name: 'Nuovo nome' };
    const merged = mergeOsmWays([footway], [renamed]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Nuovo nome');
  });
});

describe('OSM classifier prior', () => {
  it('rasterizes areas, holes, roads and trees at working resolution', () => {
    const building = way({
      id: 1,
      kind: 'building',
      building: 'yes',
      coords: ring([[10, 10], [40, 10], [40, 40], [10, 40]]),
    });
    const pond = way({
      id: 2,
      kind: 'natural',
      natural: 'water',
      coords: ring([[50, 10], [90, 10], [90, 50], [50, 50]]),
      holes: [ring([[60, 20], [80, 20], [80, 40], [60, 40]])],
    });
    const road = way({
      id: 3,
      kind: 'highway',
      highway: 'primary',
      coords: [
        { x: 0, y: 70 },
        { x: 100, y: 70 },
      ],
    });
    const tree = way({ id: 4, kind: 'tree', natural: 'tree', coords: [{ x: 5, y: 5 }] });
    const { prior, stats } = buildOsmPriorMap([building, pond, road, tree], 100, 100, 100, 100);
    expect(prior.width).toBe(100);
    expect(prior.classes[20 * 100 + 20]).toBe(4);
    expect(prior.classes[30 * 100 + 70]).toBe(0);
    expect(prior.classes[5 * 100 + 5]).toBe(1);
    expect(prior.classes[70 * 100 + 50]).toBe(4);
    expect(stats.areas).toBeGreaterThanOrEqual(2);
    expect(stats.trees).toBe(1);
  });

  it('scales source coordinates to the classifier working resolution', () => {
    const building = way({
      id: 1,
      kind: 'building',
      building: 'yes',
      coords: ring([[20, 20], [80, 20], [80, 80], [20, 80]]),
    });
    const { prior } = buildOsmPriorMap([building], 50, 50, 100, 100);
    expect(prior.classes[25 * 50 + 25]).toBe(4);
    expect(prior.classes[5 * 50 + 5]).toBe(0);
  });
});
