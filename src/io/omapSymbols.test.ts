import { describe, expect, it } from 'vitest';
import { createFeature } from '../model/constants';
import { exportSymbolCodes, symbolCode } from '../model/mapSymbols';
import type { MapStandard } from '../model/types';
import { makeTestProject } from '../test/fixtures';
import { exportProjectOmap } from './exportOmap';
import { ISOM_SYMBOL_SET, ISSPROM_SYMBOL_SET } from './omapSymbolSets';

function standardProject(standard: MapStandard) {
  return makeTestProject({ mapStandard: standard, printScale: 15000 });
}

function xmlIsWellFormed(xml: string): boolean {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return !doc.querySelector('parsererror');
}

function isomId(code: string): number {
  const symbol = ISOM_SYMBOL_SET.symbols.find((item) => item.code === code);
  expect(symbol, `ISOM symbol ${code}`).toBeDefined();
  return symbol!.id;
}

function isspromId(code: string): number {
  const symbol = ISSPROM_SYMBOL_SET.symbols.find((item) => item.code === code);
  expect(symbol, `ISSprOM symbol ${code}`).toBeDefined();
  return symbol!.id;
}

describe('official IOF symbol mapping', () => {
  it('maps every editor type to the official ISOM code', () => {
    expect(symbolCode('forest', 'isom')).toBe('405');
    expect(symbolCode('thicket', 'isom')).toBe('410');
    expect(symbolCode('open', 'isom')).toBe('401');
    expect(symbolCode('water', 'isom')).toBe('301');
    expect(symbolCode('building', 'isom')).toBe('521');
    expect(symbolCode('artificial', 'isom')).toBe('501');
    expect(symbolCode('road', 'isom')).toBe('503');
    expect(symbolCode('path', 'isom')).toBe('505');
    expect(symbolCode('stream', 'isom')).toBe('304');
    expect(symbolCode('fence', 'isom')).toBe('516');
    expect(symbolCode('tree', 'isom')).toBe('417');
    expect(symbolCode('start', 'isom')).toBe('701');
    expect(symbolCode('control', 'isom')).toBe('703');
    expect(symbolCode('finish', 'isom')).toBe('706');
  });

  it('maps sprint types to ISSprOM codes', () => {
    expect(symbolCode('road', 'issprom')).toBe('501.17');
    expect(symbolCode('path', 'issprom')).toBe('505.1');
    expect(symbolCode('stream', 'issprom')).toBe('305');
    expect(exportSymbolCodes('water', 'issprom')).toEqual(['301.1', '301.6']);
    expect(exportSymbolCodes('building', 'issprom')).toEqual(['521.3', '521.4']);
  });

  it('resolves every editor type against both complete official sets', () => {
    const types = ['forest', 'thicket', 'open', 'water', 'building', 'artificial', 'road', 'path', 'stream', 'fence', 'tree', 'start', 'control', 'finish'];
    for (const [standard, set] of [
      ['isom', ISOM_SYMBOL_SET],
      ['issprom', ISSPROM_SYMBOL_SET],
    ] as const) {
      const available = new Set(set.symbols.map((symbol) => symbol.code));
      for (const type of types) {
        const codes = exportSymbolCodes(type, standard);
        expect(codes.length, `${standard}:${type}`).toBeGreaterThan(0);
        for (const code of codes) expect(available.has(code), `${standard}:${type} -> ${code}`).toBe(true);
      }
    }
  });

  it('ships the complete official sets with contiguous ids and complete colours', () => {
    expect(ISOM_SYMBOL_SET.symbols).toHaveLength(191);
    expect(ISSPROM_SYMBOL_SET.symbols).toHaveLength(185);
    for (const set of [ISOM_SYMBOL_SET, ISSPROM_SYMBOL_SET]) {
      expect(set.symbols.map((symbol) => symbol.id)).toEqual(set.symbols.map((_, index) => index));
      expect(set.colors).toMatch(new RegExp(`<colors count="${set.colors.match(/<color /g)?.length}">`));
    }
    expect(ISOM_SYMBOL_SET.colors).toContain('<colors count="35">');
    expect(ISSPROM_SYMBOL_SET.colors).toContain('<colors count="32">');
    expect(ISOM_SYMBOL_SET.symbols.map((symbol) => symbol.code)).toEqual(
      expect.arrayContaining(['405', '401', '410', '521', '301.1', '301.4', '501.1', '501.2', '503', '505', '304', '516', '417', '701', '703', '706', '704', '705', '101', '102']),
    );
    expect(ISSPROM_SYMBOL_SET.symbols.map((symbol) => symbol.code)).toEqual(
      expect.arrayContaining(['405', '401', '410', '521.3', '521.4', '301.1', '301.6', '501.5', '501.1', '501.17', '505.1', '305', '516', '417', '701', '703', '706', '704', '705', '101', '102']),
    );
  });
});

describe('exported .omap uses the official symbol set', () => {
  it('writes ISOM codes and the matching symbol ids', () => {
    const project = standardProject('isom');
    project.features = [
      createFeature('area', 'forest', [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
        { x: 400, y: 400 },
        { x: 100, y: 400 },
      ]),
      createFeature('line', 'road', [
        { x: 100, y: 500 },
        { x: 700, y: 500 },
      ]),
      createFeature('point', 'tree', [{ x: 600, y: 200 }]),
    ];
    const xml = exportProjectOmap(project);
    expect(xmlIsWellFormed(xml)).toBe(true);
    expect(xml).toContain('<symbols count="191"');
    expect(xml).toContain('code="405" name="Forest"');
    expect(xml).toContain('code="503" name="Road"');
    expect(xml).toContain('code="417" name="Prominent large tree"');
    expect(xml).toContain('<t k="terrain-o:simbolo">405</t>');
    expect(xml).toContain(`<object type="1" symbol="${isomId('405')}"`);
    expect(xml).toContain(`<object type="1" symbol="${isomId('503')}"`);
    expect(xml).toContain(`<object type="0" symbol="${isomId('417')}"`);
    const ids = new Set(ISOM_SYMBOL_SET.symbols.map((symbol) => symbol.id));
    for (const match of xml.matchAll(/<object[^>]*symbol="(\d+)"/g)) {
      expect(ids.has(Number(match[1]))).toBe(true);
    }
    expect(xml).not.toContain('<t k="terrain-o:simbolo">310</t>');
    expect(xml).not.toContain('<t k="terrain-o:simbolo">502</t>');
  });

  it('writes ISSprOM codes, fill and companion outline objects', () => {
    const project = standardProject('issprom');
    project.features = [
      createFeature(
        'area',
        'water',
        [
          { x: 100, y: 100 },
          { x: 500, y: 100 },
          { x: 500, y: 500 },
          { x: 100, y: 500 },
        ],
        {
          holes: [
            [
              { x: 200, y: 200 },
              { x: 260, y: 200 },
              { x: 260, y: 260 },
              { x: 200, y: 260 },
            ],
          ],
        },
      ),
      createFeature('area', 'building', [
        { x: 600, y: 100 },
        { x: 750, y: 100 },
        { x: 750, y: 220 },
        { x: 600, y: 220 },
      ]),
      createFeature('line', 'path', [
        { x: 600, y: 300 },
        { x: 800, y: 400 },
      ]),
    ];
    const xml = exportProjectOmap(project);
    expect(xmlIsWellFormed(xml)).toBe(true);
    expect(xml).toContain('<symbols count="185"');
    expect(xml).toContain('code="301.1"');
    expect(xml).toContain('code="301.6"');
    expect(xml).toContain('code="521.3"');
    expect(xml).toContain('code="521.4"');
    expect(xml).toContain('code="505.1"');
    // Water fill + bank outline for the outer ring and the hole.
    expect(xml.match(new RegExp(`<object type="1" symbol="${isspromId('301.1')}"`, 'g'))).toHaveLength(1);
    expect(xml.match(new RegExp(`<object type="1" symbol="${isspromId('301.6')}"`, 'g'))).toHaveLength(2);
    // Sprint building fill + its official outline.
    expect(xml.match(new RegExp(`<object type="1" symbol="${isspromId('521.3')}"`, 'g'))).toHaveLength(1);
    expect(xml.match(new RegExp(`<object type="1" symbol="${isspromId('521.4')}"`, 'g'))).toHaveLength(1);
    expect(xml).not.toContain('<t k="terrain-o:simbolo">503</t>');
    expect(xml).not.toContain('<t k="terrain-o:simbolo">304</t>');
  });

  it('exports contours as 101/102 and control numbers as 704', () => {
    const project = standardProject('isom');
    project.features = [
      createFeature('point', 'control', [{ x: 300, y: 300 }], { code: '101' }),
    ];
    project.contours = [
      { elevation: 500, coords: [{ x: 100, y: 100 }, { x: 200, y: 120 }], closed: false, index: false },
      { elevation: 510, coords: [{ x: 100, y: 200 }, { x: 220, y: 220 }], closed: false, index: true },
    ];
    const xml = exportProjectOmap(project);
    expect(xml).toContain('<t k="terrain-o:simbolo">101</t>');
    expect(xml).toContain('<t k="terrain-o:simbolo">102</t>');
    expect(xml).toContain(`<object type="4" symbol="${isomId('704')}"`);
    expect(xml).toContain('<text>101</text>');
    expect(xml).toContain(`<object type="0" symbol="${isomId('703')}"`);
  });
});
