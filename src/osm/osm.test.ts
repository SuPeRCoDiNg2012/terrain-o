import { describe, expect, it } from 'vitest';
import type { OsmWay } from '../model/types';
import { buildOsmApiUrl, buildOverpassQuery, parseOsmApiXml } from './client';
import { mergeOsmWays, osmWaysToFeatures } from './convert';

describe('buildOverpassQuery', () => {
  it('uses the valid out body geom syntax and south/west/north/east bounds', () => {
    const query = buildOverpassQuery({ west: 11.5, south: 46.5, east: 11.55, north: 46.52 });
    expect(query).toContain('[out:json]');
    expect(query).toContain('46.500000,11.500000,46.520000,11.550000');
    expect(query).toContain('out body geom;');
    expect(query).not.toContain('out geom tags');
  });
});

describe('OSM API fallback', () => {
  it('builds a west,south,east,north bbox URL', () => {
    const url = buildOsmApiUrl({ west: 11.5, south: 46.5, east: 11.55, north: 46.52 });
    expect(url).toContain('bbox=11.500000,46.500000,11.550000,46.520000');
  });

  it('parses node geometry and filters non-road ways', () => {
    const xml = `<?xml version="1.0"?><osm version="0.6">
      <node id="1" lat="46.5" lon="11.5"/>
      <node id="2" lat="46.501" lon="11.501"/>
      <way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="track"/><tag k="name" v="Strada bianca"/></way>
      <way id="11"><nd ref="1"/><nd ref="2"/><tag k="landuse" v="forest"/></way>
    </osm>`;
    const ways = parseOsmApiXml(xml);
    expect(ways).toHaveLength(1);
    expect(ways[0]).toMatchObject({ id: 10, kind: 'highway', highway: 'track', name: 'Strada bianca' });
    expect(ways[0].geometry).toEqual([
      { lat: 46.5, lon: 11.5 },
      { lat: 46.501, lon: 11.501 },
    ]);
  });
});

describe('OSM conversion', () => {
  const way: OsmWay = {
    id: 42,
    kind: 'highway',
    highway: 'footway',
    name: 'Sentiero test',
    coords: [
      { x: 10, y: 10 },
      { x: 50, y: 40 },
    ],
  };

  it('converts footways to path features with OSM provenance', () => {
    const features = osmWaysToFeatures([way], []);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      kind: 'line',
      type: 'path',
      source: 'osm',
      osmId: 42,
      name: 'Sentiero test',
    });
  });

  it('does not duplicate an OSM way already converted', () => {
    const first = osmWaysToFeatures([way], []);
    const second = osmWaysToFeatures([way], first);
    expect(second).toHaveLength(0);
  });

  it('merges repeated downloads by OSM id', () => {
    const renamed = { ...way, name: 'Nuovo nome' };
    const merged = mergeOsmWays([way], [renamed]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Nuovo nome');
  });
});
