import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Point } from '../model/types';
import { extractContours } from './contourExtractor';
import { assemblePolygons, ringSelfIntersects, validateRegions } from './topology';
import { smoothAndSimplify } from './simplify';
import { reconcilePolygons } from './edgeReconcile';
import { vectorize } from './pipeline';
import type { PolygonalRegion } from './types';

const WIDTH = 14;
const HEIGHT = 12;

function maskFrom(bits: boolean[]): Uint8Array {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  bits.forEach((value, index) => {
    if (value) mask[index % mask.length] = 1;
  });
  return mask;
}

function areaOf(region: { coords: Point[]; holes: Point[][] }): number {
  const signed = (ring: Point[]) => {
    let total = 0;
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
  };
  return Math.abs(signed(region.coords)) - region.holes.reduce((sum, hole) => sum + Math.abs(signed(hole)), 0);
}

describe('property: contours and topology', () => {
  it('every traced ring is closed, simple and reconstructs the mask area', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: WIDTH * HEIGHT, maxLength: WIDTH * HEIGHT }), (bits) => {
        const mask = maskFrom(bits);
        const filled = mask.reduce((sum, value) => sum + value, 0);
        if (filled === 0) return;
        const rings = extractContours(mask, WIDTH, HEIGHT);
        for (const ring of rings) {
          expect(ring.closed).toBe(true);
          expect(ring.points.length).toBeGreaterThanOrEqual(3);
          expect(ringSelfIntersects(ring.points)).toBe(false);
        }
        const polygons = assemblePolygons(rings.map((ring) => ({ points: ring.points, classId: 1 })));
        const total = polygons.reduce((sum, polygon) => sum + polygon.area, 0);
        expect(Math.abs(total - filled)).toBeLessThan(1e-6);
      }),
      { numRuns: 60 },
    );
  });

  it('simplification never introduces self-intersections and keeps the area', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: WIDTH * HEIGHT, maxLength: WIDTH * HEIGHT }), (bits) => {
        const mask = maskFrom(bits);
        if (mask.reduce((sum, value) => sum + value, 0) < 8) return;
        const rings = extractContours(mask, WIDTH, HEIGHT);
        const polygons = assemblePolygons(rings.map((ring) => ({ points: ring.points, classId: 1 })));
        for (const polygon of polygons) {
          if (polygon.outer.length < 4) continue;
          const before = areaOf({ coords: polygon.outer, holes: [] });
          const simplified = smoothAndSimplify(polygon.outer, 1, 1);
          if (simplified.length < 3) continue;
          expect(ringSelfIntersects(simplified)).toBe(false);
          expect(Math.abs(areaOf({ coords: simplified, holes: [] }) - before)).toBeLessThan(before * 0.08 + 2);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('property: full pipeline', () => {
  it('returns only topologically valid geometry for arbitrary masks', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: WIDTH * HEIGHT, maxLength: WIDTH * HEIGHT }), (bits) => {
        const labels = new Uint8Array(WIDTH * HEIGHT);
        bits.forEach((value, index) => {
          if (value) labels[index] = 1;
        });
        const result = vectorize(
          { labels, width: WIDTH, height: HEIGHT },
          { categories: [1], minAreaPx: 4, minHoleAreaPx: 2, simplifyTolerance: 0.8, smoothIterations: 1 },
        );
        expect(validateRegions(result.regions)).toHaveLength(0);
        for (const region of result.regions) {
          expect(region.coords.length).toBeGreaterThanOrEqual(3);
          expect(region.area).toBeGreaterThan(0);
          expect(ringSelfIntersects(region.coords)).toBe(false);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('property: edge reconciliation', () => {
  it('adjacent polygons keep the summed area after snapping', () => {
    fc.assert(
      fc.property(fc.integer({ min: 32, max: 60 }), fc.integer({ min: 24, max: 48 }), fc.double({ min: 0.05, max: 0.6, noNaN: true }), (width, height, offset) => {
        const left: Pick<PolygonalRegion, 'coords' | 'holes'> = {
          coords: [
            { x: 0, y: 0 },
            { x: width, y: 0 },
            { x: width, y: height },
            { x: 0, y: height },
          ],
          holes: [],
        };
        const right: Pick<PolygonalRegion, 'coords' | 'holes'> = {
          coords: [
            { x: width + offset, y: 0 },
            { x: width * 2, y: 0 },
            { x: width * 2, y: height },
            { x: width + offset, y: height },
          ],
          holes: [],
        };
        const [a, b] = reconcilePolygons([left, right], 0.8);
        const total = areaOf(a) + areaOf(b);
        expect(Math.abs(total - width * height * 2) / (width * height * 2)).toBeLessThan(0.002);
        const sharedA = a.coords.filter((point) => Math.abs(point.x - width) < 0.9);
        const sharedB = b.coords.filter((point) => Math.abs(point.x - width) < 0.9);
        expect(sharedA.length).toBeGreaterThan(0);
        expect(sharedB.length).toBeGreaterThan(0);
      }),
      { numRuns: 30 },
    );
  });
});
