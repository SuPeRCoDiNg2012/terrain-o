import { describe, expect, it } from 'vitest';
import type { Point } from '../model/types';
import { extractContours, signedArea, splitAtRepeatedVertices } from './contourExtractor';
import { assemblePolygons, ringSelfIntersects, validateRegions, pointInRing } from './topology';
import { smoothAndSimplify, ringPerimeter } from './simplify';
import { reconcilePolygons } from './edgeReconcile';
import { filterRegions } from './filter';
import { vectorize } from './pipeline';
import { regionsToGeoJson } from './export';
import { DEFAULT_VECTORIZE_OPTIONS } from './types';

function diskMask(width: number, height: number, cx: number, cy: number, radius: number, holeRadius = 0): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= radius && distance >= holeRadius) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function polygonArea(coords: Point[]): number {
  return Math.abs(signedArea(coords));
}

describe('contour extraction', () => {
  it('produces one closed ring for a disk with the correct area', () => {
    const width = 96;
    const height = 96;
    const radius = 30;
    const rings = extractContours(diskMask(width, height, 48, 48, radius), width, height);
    expect(rings).toHaveLength(1);
    expect(rings[0].closed).toBe(true);
    expect(polygonArea(rings[0].points)).toBeGreaterThan(Math.PI * radius * radius * 0.95);
    expect(polygonArea(rings[0].points)).toBeLessThan(Math.PI * radius * radius * 1.05);
    expect(ringSelfIntersects(rings[0].points)).toBe(false);
  });

  it('keeps diagonally touching pixels in separate rings', () => {
    const width = 8;
    const height = 8;
    const mask = new Uint8Array(width * height);
    mask[2 * width + 2] = 1;
    mask[3 * width + 3] = 1;
    const rings = extractContours(mask, width, height);
    expect(rings).toHaveLength(2);
  });

  it('traces shapes touching the image border without open rings', () => {
    const width = 32;
    const height = 32;
    const mask = new Uint8Array(width * height).fill(1);
    const rings = extractContours(mask, width, height);
    expect(rings).toHaveLength(1);
    expect(rings[0].closed).toBe(true);
    expect(polygonArea(rings[0].points)).toBeCloseTo(width * height, 0);
  });
});

describe('topology', () => {
  it('assigns a hole to its container', () => {
    const width = 80;
    const height = 80;
    const rings = extractContours(diskMask(width, height, 40, 40, 30, 12), width, height);
    const polygons = assemblePolygons(rings.map((ring) => ({ points: ring.points, classId: 1 })));
    expect(polygons).toHaveLength(1);
    expect(polygons[0].holes).toHaveLength(1);
    const expected = Math.PI * 30 * 30 - Math.PI * 12 * 12;
    expect(polygons[0].area).toBeGreaterThan(expected * 0.94);
    expect(polygons[0].area).toBeLessThan(expected * 1.06);
  });

  it('handles an island inside a hole', () => {
    const width = 120;
    const height = 120;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.hypot(x - 60, y - 60);
        const inOuterRing = distance <= 50 && distance >= 30;
        const inIsland = distance <= 14;
        if (inOuterRing || inIsland) labels[y * width + x] = 1;
      }
    }
    const result = vectorize({ labels, width, height }, { categories: [1], minAreaPx: 10, minHoleAreaPx: 5 });
    expect(result.regions).toHaveLength(2);
    const totalHoles = result.regions.reduce((sum, region) => sum + region.holes.length, 0);
    expect(totalHoles).toBe(1);
  });

  it('detects self-intersections', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(ringSelfIntersects(bowtie)).toBe(true);
  });
});

describe('simplification', () => {
  it('removes staircase vertices while preserving the area', () => {
    const width = 140;
    const height = 140;
    const radius = 52;
    const ring = extractContours(diskMask(width, height, 70, 70, radius), width, height)[0].points;
    const beforeArea = polygonArea(ring);
    const beforePerimeter = ringPerimeter(ring);
    const simplified = smoothAndSimplify(ring, 1.5, 2);
    const afterArea = polygonArea(simplified);
    expect(ringSelfIntersects(simplified)).toBe(false);
    expect(simplified.length).toBeLessThan(ring.length);
    expect(ringPerimeter(simplified)).toBeLessThan(beforePerimeter);
    expect(Math.abs(afterArea - beforeArea) / beforeArea).toBeLessThan(0.03);
  });

  it('keeps small rectangles sharp', () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ];
    const simplified = smoothAndSimplify(rectangle, 1.5, 2);
    expect(simplified).toHaveLength(4);
    expect(polygonArea(simplified)).toBeCloseTo(200, 5);
  });
});

describe('edge reconciliation', () => {
  it('snaps and shares the boundary between adjacent polygons', () => {
    const left = {
      coords: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ],
      holes: [],
    };
    const right = {
      coords: [
        { x: 40.2, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 40 },
        { x: 39.9, y: 40 },
        { x: 39.9, y: 20 },
      ],
      holes: [],
    };
    const [a, b] = reconcilePolygons([left, right], 0.7);
    expect(Math.abs(a.coords[1].x - b.coords[0].x)).toBeLessThan(0.1);
    expect(Math.abs(a.coords[2].x - b.coords[b.coords.length - 1].x)).toBeLessThan(0.1);
    expect(polygonArea(a.coords) + polygonArea(b.coords)).toBeCloseTo(3200, 0);
  });
});

describe('hierarchy priority on overlapping claims', () => {
  it('gives the contested pixels to the more specific class', () => {
    const width = 80;
    const height = 60;
    const open = new Uint8Array(width * height).fill(255);
    const water = new Uint8Array(width * height);
    for (let y = 20; y < 40; y++) {
      for (let x = 20; x < 60; x++) water[y * width + x] = 255;
    }
    const claims = new Map<number, Uint8Array>([
      [2, open],
      [3, water],
    ]);
    const result = vectorize(
      { labels: new Uint8Array(width * height), width, height, claims },
      { categories: [2, 3], minAreaPx: 10, minHoleAreaPx: 5, simplifyTolerance: 1, smoothIterations: 0, hierarchyPriority: true },
    );
    expect(result.regions).toHaveLength(2);
    const waterRegion = result.regions.find((region) => region.classId === 3)!;
    const openRegion = result.regions.find((region) => region.classId === 2)!;
    expect(waterRegion.area).toBeCloseTo(800, 0);
    expect(openRegion.area).toBeCloseTo(width * height - 800, 0);
  });
});

describe('filtering', () => {
  it('drops polygons below the minimum area', () => {
    const tiny = {
      featureType: 'forest',
      classId: 1,
      confidence: 0.8,
      coords: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 0, y: 5 },
      ],
      holes: [],
      area: 12,
    };
    const result = filterRegions([tiny], { ...DEFAULT_VECTORIZE_OPTIONS, minAreaPx: 100 });
    expect(result.kept).toHaveLength(0);
    expect(result.discarded).toBe(1);
  });
});

describe('shared boundaries', () => {
  it('splits a self-touching ring into simple loops without losing area', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 2, y: 2 },
      { x: 0, y: 4 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 0 },
    ];
    const loops = splitAtRepeatedVertices(path);
    expect(loops.length).toBe(2);
    const totalBefore = Math.abs(signedArea(path));
    const totalAfter = loops.reduce((sum, loop) => sum + Math.abs(signedArea(loop)), 0);
    expect(Math.abs(totalAfter - totalBefore)).toBeLessThan(1e-6);
  });

  it('keeps a wavy class boundary shared after smoothing', () => {
    const width = 200;
    const height = 160;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const boundary = width / 2 + Math.sin(y / 14) * 18 + Math.cos(y / 6) * 5;
        labels[y * width + x] = x < boundary ? 1 : 2;
      }
    }
    const result = vectorize(
      { labels, width, height },
      { categories: [1, 2], minAreaPx: 10, minHoleAreaPx: 5, simplifyTolerance: 1.5, smoothIterations: 2 },
    );
    expect(result.regions).toHaveLength(2);
    const total = result.regions.reduce((sum, region) => sum + region.area, 0);
    expect(total).toBeGreaterThan(width * height * 0.995);
    expect(total).toBeLessThanOrEqual(width * height + 1);
    expect(validateRegions(result.regions)).toHaveLength(0);
  });
});

describe('pipeline', () => {
  it('vectorizes two adjacent classes with no gap and no overlap', () => {
    const width = 100;
    const height = 80;
    const labels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) labels[y * width + x] = x < width / 2 ? 1 : 2;
    }
    const result = vectorize(
      { labels, width, height },
      { categories: [1, 2], minAreaPx: 10, minHoleAreaPx: 5, simplifyTolerance: 1, smoothIterations: 1 },
    );
    expect(result.regions).toHaveLength(2);
    const total = result.regions.reduce((sum, region) => sum + region.area, 0);
    expect(total).toBeCloseTo(width * height, 0);
    expect(validateRegions(result.regions)).toHaveLength(0);
    for (const region of result.regions) {
      expect(region.holes).toHaveLength(0);
      expect(region.coords.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('respects the confidence threshold when a map is provided', () => {
    const width = 40;
    const height = 40;
    const labels = new Uint8Array(width * height).fill(1);
    const confidence = new Float32Array(width * height).fill(0.9);
    confidence[10] = 0.1;
    confidence[11] = 0.1;
    const result = vectorize(
      { labels, width, height, confidence },
      { categories: [1], confidenceThreshold: 0.6, minAreaPx: 1 },
    );
    expect(result.regions).toHaveLength(1);
  });

  it('keeps generated geometry topologically valid on random blobs', () => {
    const width = 140;
    const height = 140;
    const labels = new Uint8Array(width * height);
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let index = 0; index < 8; index++) {
      const cx = 20 + random() * (width - 40);
      const cy = 20 + random() * (height - 40);
      const rx = 6 + random() * 20;
      const ry = 6 + random() * 20;
      const classId = 1 + Math.floor(random() * 3);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const value = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (value <= 1) labels[y * width + x] = classId;
          else if (value <= 1.35 && random() > 0.5) labels[y * width + x] = classId;
        }
      }
    }
    const result = vectorize({ labels, width, height }, { minAreaPx: 20, minHoleAreaPx: 8, simplifyTolerance: 1.2 });
    expect(validateRegions(result.regions)).toHaveLength(0);
    for (const region of result.regions) {
      expect(region.area).toBeGreaterThan(0);
      expect(ringSelfIntersects(region.coords)).toBe(false);
    }
  });
});

describe('GeoJSON bridge', () => {
  it('marks every automatic region as provenance auto', () => {
    const region = {
      featureType: 'forest',
      classId: 1,
      confidence: 0.81,
      coords: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [],
      area: 100,
    };
    const collection = regionsToGeoJson([region]);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.provenance).toBe('auto');
    expect(collection.metadata.coordinateSystem).toBe('pixel');
    expect(collection.features[0].geometry.coordinates[0]).toHaveLength(5);
  });

  it('blocks the export when a region is invalid', () => {
    const invalid = {
      featureType: 'forest',
      classId: 1,
      confidence: 0.5,
      coords: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      holes: [],
      area: 0,
    };
    expect(() => regionsToGeoJson([invalid])).toThrow(/Topologia non valida/);
  });
});

describe('hole containment', () => {
  it('uses point-in-polygon on a known square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInRing({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInRing({ x: 15, y: 5 }, square)).toBe(false);
  });
});
