import { describe, expect, it } from 'vitest';
import type { OsmWay } from '../model/types';
import { computeOsmContrasts, filterOsmContrasts, osmContrastsToCsv } from './contrasts';

function ring(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
}

function way(id: number, coords: Array<{ x: number; y: number }>, extra: Partial<OsmWay> = {}): OsmWay {
  return { id, kind: 'building', building: 'yes', coords, ...extra };
}

describe('OSM contrast report', () => {
  it('reports an area whose final class disagrees and skips agreeing areas', () => {
    const labels = new Uint8Array(20 * 20).fill(1);
    const building = way(10, ring(2, 2, 8, 8));
    const forest = way(11, ring(10, 10, 18, 18), {
      kind: 'landuse',
      building: undefined,
      landuse: 'forest',
      tags: { landuse: 'forest' },
    });
    const contrasts = computeOsmContrasts(labels, 20, 20, [building, forest], 20, 20, { minAreaPx: 16 });
    expect(contrasts).toHaveLength(1);
    expect(contrasts[0]).toMatchObject({
      osmId: 10,
      name: 'Edifici',
      label: 'Edifici',
      classKey: 'art',
      agreement: 0,
      areaPx: 36,
    });
  });

  it('ignores elements below the minimum area and returns the most contrasting ones first', () => {
    const labels = new Uint8Array(20 * 20).fill(1);
    const tiny = way(1, ring(0, 0, 1, 1));
    const small = way(2, ring(2, 2, 4, 4));
    const large = way(3, ring(6, 6, 16, 16), { name: 'Capannone' });
    const contrasts = computeOsmContrasts(labels, 20, 20, [tiny, small, large], 20, 20, {
      minAreaPx: 4,
      limit: 1,
    });
    expect(contrasts).toHaveLength(1);
    expect(contrasts[0]).toMatchObject({ osmId: 3, name: 'Capannone', classKey: 'art' });
    expect(contrasts[0].areaPx).toBeGreaterThan(70);
  });

  it('filters the report by class family and minimum area', () => {
    const labels = new Uint8Array(20 * 20).fill(1);
    const smallBuilding = way(20, ring(1, 1, 4, 4));
    const largeBuilding = way(21, ring(5, 5, 14, 14));
    const water = way(22, ring(0, 15, 5, 19), {
      kind: 'natural',
      building: undefined,
      natural: 'water',
      tags: { natural: 'water' },
    });
    const contrasts = computeOsmContrasts(
      labels,
      20,
      20,
      [smallBuilding, largeBuilding, water],
      20,
      20,
      { minAreaPx: 4 },
    );

    expect(filterOsmContrasts(contrasts)).toHaveLength(3);
    // Equal agreement: the larger area comes first.
    expect(filterOsmContrasts(contrasts, { classKey: 'art' }).map((item) => item.osmId)).toEqual([21, 20]);
    expect(filterOsmContrasts(contrasts, { classKey: 'water' }).map((item) => item.osmId)).toEqual([22]);
    expect(filterOsmContrasts(contrasts, { classKey: 'veg' })).toEqual([]);
    expect(
      filterOsmContrasts(contrasts, { classKey: 'art', minAreaPx: 50 }).map((item) => item.osmId),
    ).toEqual([21]);
  });

  it('exports the visible rows as escaped CSV', () => {
    // Water labels make both the building and the forest disagree with OSM.
    const labels = new Uint8Array(20 * 20).fill(3);
    const building = way(30, ring(2, 2, 8, 8), { name: 'Capannone, "nord"' });
    const forest = way(31, ring(10, 10, 18, 18), {
      kind: 'landuse',
      building: undefined,
      landuse: 'forest',
      tags: { landuse: 'forest' },
      name: '=Bosco',
    });
    const contrasts = computeOsmContrasts(labels, 20, 20, [building, forest], 20, 20, { minAreaPx: 16 });
    const csv = osmContrastsToCsv(contrasts, { generatedIds: new Set([30]) });
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('nome,id_osm,classe,chiave_classe,accordo_percento,area_px,generato');
    expect(lines).toHaveLength(3);
    const buildingLine = lines.find((line) => line.includes(',30,'));
    const forestLine = lines.find((line) => line.includes(',31,'));
    expect(buildingLine).toContain('"Capannone, ""nord"""');
    expect(buildingLine).toContain(',30,Edifici,art,0.0,36,sì');
    // Names starting with a formula character are neutralized for spreadsheets.
    expect(forestLine).toContain("'=Bosco");
    expect(forestLine).toContain(',no');
  });

  it('returns nothing without OSM areas or labels', () => {
    expect(computeOsmContrasts(new Uint8Array(4), 2, 2, [], 2, 2)).toEqual([]);
    expect(computeOsmContrasts(new Uint8Array(0), 0, 0, [way(1, ring(0, 0, 2, 2))], 2, 2)).toEqual([]);
  });
});
