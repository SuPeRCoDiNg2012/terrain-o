import type { PolygonalRegion, VectorizeOptions } from './types';
import { ringPerimeter } from './simplify';
import { ringArea } from './topology';

export interface FilterResult {
  kept: PolygonalRegion[];
  discarded: number;
}

function shapeIndex(area: number, perimeter: number): number {
  if (perimeter <= 0) return 0;
  return (4 * Math.PI * area) / (perimeter * perimeter);
}

/**
 * Drops micro-polygons and needle-like slivers. The shape test is skipped for
 * point-like classes (a boulder is legitimately small) and only rejects very thin
 * shapes, so narrow but real features survive.
 */
export function filterRegions(regions: PolygonalRegion[], options: VectorizeOptions): FilterResult {
  const minArea = Math.max(0, options.minAreaPx);
  const minHole = Math.max(0, options.minHoleAreaPx);
  const kept: PolygonalRegion[] = [];
  let discarded = 0;

  for (const region of regions) {
    if (region.area < minArea) {
      discarded++;
      continue;
    }
    const perimeter = ringPerimeter(region.coords);
    const compactness = shapeIndex(region.area, perimeter);
    const pointLike = region.classId <= 0;
    if (!pointLike && compactness < 0.045 && region.area < minArea * 12) {
      discarded++;
      continue;
    }
    // fillHoles=true removes pinholes so the polygon exports as a clean single
    // ring; fillHoles=false keeps every real hole, including tiny ones.
    const holes = options.fillHoles === false
      ? region.holes.filter((hole) => hole.length >= 3)
      : region.holes.filter((hole) => ringArea(hole) >= minHole);
    if (holes.length !== region.holes.length) {
      const holeArea = holes.reduce((sum, hole) => sum + ringArea(hole), 0);
      kept.push({ ...region, holes, area: Math.max(0, ringArea(region.coords) - holeArea) });
      continue;
    }
    kept.push({ ...region, holes });
  }

  return { kept, discarded };
}
