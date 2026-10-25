import { describe, expect, it } from 'vitest';
import type { Point } from '../model/types';
import { vectorize } from './pipeline';
import { ringSelfIntersects } from './topology';

function signed(ring: Point[]): number {
  let total = 0;
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    total += a.x * b.y - b.x * a.y;
  }
  return Math.abs(total) / 2;
}

function areaOf(region: { coords: Point[]; holes: Point[][] }): number {
  return signed(region.coords) - region.holes.reduce((sum, hole) => sum + signed(hole), 0);
}

function classArea(regions: Array<{ classId: number; coords: Point[]; holes: Point[][] }>, classId: number): number {
  return regions.filter((region) => region.classId === classId).reduce((sum, region) => sum + areaOf(region), 0);
}

function pixelCount(labels: Uint8Array, classId: number): number {
  let count = 0;
  for (const label of labels) if (label === classId) count++;
  return count;
}

describe('vectorization integration', () => {
  it('keeps the summed area of two adjacent classes exact', () => {
    const width = 160;
    const height = 120;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) labels[y * width + x] = x < 73 ? 1 : 3;
    }
    const result = vectorize({ labels, width, height }, { minAreaPx: 20, minHoleAreaPx: 10 });
    expect(result.stats.invalid).toBe(0);
    expect(Math.abs(classArea(result.regions, 1) + classArea(result.regions, 3) - width * height)).toBeLessThan(1);
    for (const region of result.regions) {
      expect(ringSelfIntersects(region.coords)).toBe(false);
      expect(region.holes.every((hole) => !ringSelfIntersects(hole))).toBe(true);
    }
  });

  it('turns a donut into one polygon with one real hole', () => {
    const width = 100;
    const height = 100;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.hypot(x - 50, y - 50);
        labels[y * width + x] = distance < 40 && distance > 18 ? 1 : 2;
      }
    }
    const result = vectorize({ labels, width, height }, { categories: [1], minAreaPx: 10, minHoleAreaPx: 10 });
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].holes).toHaveLength(1);
    const expected = pixelCount(labels, 1);
    expect(Math.abs(result.regions[0].area - expected) / expected).toBeLessThan(0.03);
  });

  it('keeps islands inside holes as separate outer rings', () => {
    const width = 120;
    const height = 120;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.hypot(x - 60, y - 60);
        labels[y * width + x] = distance < 50 ? 1 : 2;
        if (distance > 22 && distance < 34) labels[y * width + x] = 2;
        if (distance < 10) labels[y * width + x] = 1;
      }
    }
    const result = vectorize({ labels, width, height }, { categories: [1], minAreaPx: 10, minHoleAreaPx: 10 });
    expect(result.regions).toHaveLength(2);
    expect(result.regions.filter((region) => region.holes.length === 1)).toHaveLength(1);
  });

  it('conserves each class area across simplification and reconciliation', () => {
    const width = 200;
    const height = 140;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const edge = 70 + 18 * Math.sin(x / 11) + 8 * Math.cos(x / 4.3);
        labels[y * width + x] = y < edge ? 1 : 3;
      }
    }
    const result = vectorize({ labels, width, height }, { minAreaPx: 10, minHoleAreaPx: 10 });
    for (const classId of [1, 3]) {
      const expected = pixelCount(labels, classId);
      const area = classArea(result.regions, classId);
      expect(Math.abs(area - expected) / expected).toBeLessThan(0.02);
    }
  });

  it('keeps random blocky four-class masks valid and area-preserving', () => {
    for (let run = 0; run < 4; run++) {
      const width = 60;
      const height = 50;
      const labels = new Uint8Array(width * height);
      let seed = 7 + run * 131;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
      };
      const grid = new Uint8Array(12);
      for (let index = 0; index < grid.length; index++) grid[index] = 1 + Math.floor(random() * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const gx = Math.min(3, Math.floor((x / width) * 4));
          const gy = Math.min(2, Math.floor((y / height) * 3));
          labels[y * width + x] = grid[gy * 4 + gx];
        }
      }
      const result = vectorize({ labels, width, height }, { minAreaPx: 4, minHoleAreaPx: 2 });
      expect(result.stats.invalid).toBe(0);
      for (const region of result.regions) expect(ringSelfIntersects(region.coords)).toBe(false);
      expect(Math.abs(result.regions.reduce((sum, region) => sum + region.area, 0) - width * height)).toBeLessThan(1);
    }
  });

  it('gives adjacent polygons identical vertices on their shared boundary', () => {
    const width = 120;
    const height = 90;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        labels[y * width + x] = y < 45 + Math.round(6 * Math.sin(x / 9)) ? 1 : 2;
      }
    }
    const result = vectorize({ labels, width, height }, { minAreaPx: 20, minHoleAreaPx: 10 });
    const forest = result.regions.find((region) => region.classId === 1)!;
    const open = result.regions.find((region) => region.classId === 2)!;
    const key = (point: Point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    const forestKeys = new Set(forest.coords.map(key));
    expect(open.coords.filter((point) => forestKeys.has(key(point))).length).toBeGreaterThan(3);
  });
});
