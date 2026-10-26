import { describe, expect, it } from 'vitest';
import { createFeature } from '../model/constants';
import type { Feature, Point } from '../model/types';
import { fuseSymbols } from './fuse';

function ring(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function building(source: Feature['source'], x0: number, y0: number, x1: number, y1: number): Feature {
  return createFeature('area', 'building', ring(x0, y0, x1, y1), { source });
}

describe('symbol fusion', () => {
  it('keeps OSM over ML for the same building and records the merge', () => {
    const osm = building('osm', 10, 10, 110, 110);
    const ml = building('ml', 15, 15, 105, 105, );
    const forest = createFeature('area', 'forest', ring(300, 300, 400, 400), { source: 'osm' });
    const result = fuseSymbols([osm, ml, forest]);

    expect(result.features).toHaveLength(2);
    expect(result.removed).toEqual([ml]);
    const survivor = result.features.find((feature) => feature.id === osm.id)!;
    expect(survivor.source).toBe('osm');
    expect(survivor.mergedFrom).toContain(ml.id);
    expect(result.stats).toMatchObject({ before: 3, after: 2, removed: 1, mergedGroups: 1, protectedConflicts: 0 });
  });

  it('never modifies manual or verified duplicates', () => {
    const manual = building('manual', 0, 0, 100, 100);
    const ml = building('ml', 5, 5, 95, 95);
    const verified = createFeature('area', 'water', ring(200, 0, 300, 100), {
      source: 'manual',
      verified: true,
    });
    const manualDuplicate = createFeature('area', 'water', ring(205, 5, 295, 95), { source: 'manual' });

    const result = fuseSymbols([manual, ml, verified, manualDuplicate]);
    expect(result.features.some((feature) => feature.id === manual.id)).toBe(true);
    expect(result.features.some((feature) => feature.id === verified.id)).toBe(true);
    expect(result.features.some((feature) => feature.id === manualDuplicate.id)).toBe(true);
    expect(result.features.some((feature) => feature.id === ml.id)).toBe(false);
    expect(result.features.find((feature) => feature.id === manual.id)!.mergedFrom).toBeUndefined();
    expect(result.stats.protectedConflicts).toBe(1);
  });

  it('deduplicates nearby tree points and keeps different symbol types apart', () => {
    const tree = createFeature('point', 'tree', [{ x: 50, y: 50 }], { source: 'ml' });
    const near = createFeature('point', 'tree', [{ x: 53, y: 52 }], { source: 'osm' });
    const far = createFeature('point', 'tree', [{ x: 150, y: 52 }], { source: 'ml' });
    const water = createFeature('area', 'water', ring(40, 40, 60, 60), { source: 'ml' });
    const otherBuilding = createFeature('area', 'building', ring(40, 40, 60, 60), { source: 'ml' });

    const result = fuseSymbols([tree, near, far, water, otherBuilding], { pointDistancePx: 6 });
    const treeIds = result.features.filter((feature) => feature.type === 'tree').map((feature) => feature.id);
    expect(treeIds).toHaveLength(2);
    expect(treeIds).toContain(far.id);
    expect(treeIds.some((id) => id === tree.id || id === near.id)).toBe(true);
    expect(result.features.some((feature) => feature.id === water.id)).toBe(true);
    expect(result.features.some((feature) => feature.id === otherBuilding.id)).toBe(true);
  });

  it('removes duplicate automatic lines while keeping different line types', () => {
    const osmRoad = createFeature('line', 'road', [
      { x: 0, y: 0 },
      { x: 50, y: 1 },
      { x: 100, y: 0 },
    ], { source: 'osm' });
    const mlRoad = createFeature('line', 'road', [
      { x: 0, y: 2 },
      { x: 100, y: 2 },
    ], { source: 'vector' });
    const parallel = createFeature('line', 'road', [
      { x: 0, y: 40 },
      { x: 100, y: 40 },
    ], { source: 'osm' });
    const sameGeometryPath = createFeature('line', 'path', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ], { source: 'osm' });

    const result = fuseSymbols([osmRoad, mlRoad, parallel, sameGeometryPath]);
    expect(result.features.map((feature) => feature.id).sort()).toEqual(
      [osmRoad.id, parallel.id, sameGeometryPath.id].sort(),
    );
    expect(result.removed).toEqual([mlRoad]);
    expect(result.features.find((feature) => feature.id === osmRoad.id)!.mergedFrom).toContain(mlRoad.id);
  });

  it('never drops a manual line under an automatic duplicate', () => {
    const manual = createFeature('line', 'path', [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ], { source: 'manual' });
    const osm = createFeature('line', 'path', [
      { x: 0, y: 1 },
      { x: 80, y: 1 },
    ], { source: 'osm' });
    const short = createFeature('line', 'path', [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ], { source: 'osm' });

    const result = fuseSymbols([manual, osm, short]);
    expect(result.features.some((feature) => feature.id === manual.id)).toBe(true);
    expect(result.features.some((feature) => feature.id === osm.id)).toBe(false);
    // A short automatic path on a long manual path is a distinct feature.
    expect(result.features.some((feature) => feature.id === short.id)).toBe(true);
    expect(result.features.find((feature) => feature.id === manual.id)!.mergedFrom).toBeUndefined();
  });

  it('leaves unrelated lines, courses and unrelated points untouched', () => {
    const path = createFeature('line', 'path', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ], { source: 'osm' });
    const road = createFeature('line', 'road', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ], { source: 'osm' });
    const control = createFeature('point', 'control', [{ x: 10, y: 10 }], { source: 'gpx' });
    const result = fuseSymbols([path, road, control]);
    expect(result.features.map((feature) => feature.id)).toEqual([path.id, road.id, control.id]);
    expect(result.stats.removed).toBe(0);
    expect(result.stats.byType).toMatchObject({ path: 1, road: 1, control: 1 });
  });
});
