import type { Point } from '../model/types';

export interface ReconcileRegion {
  coords: Point[];
  holes: Point[][];
}

function projectOnSegment(point: Point, a: Point, b: Point): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return { distance: Math.hypot(point.x - a.x, point.y - a.y), t: 0 };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { distance: Math.hypot(point.x - x, point.y - y), t };
}

/**
 * Snaps nearby vertices of different polygons to one shared node and inserts
 * shared nodes on segments where one polygon has a T-junction. Adjacent regions
 * then share the same boundary vertices instead of leaving a gap or an overlap.
 */
export function reconcilePolygons<T extends ReconcileRegion>(regions: T[], tolerance = 0.75): T[] {
  if (regions.length < 2) return regions.map((region) => ({ ...region, coords: region.coords.map((p) => ({ ...p })), holes: region.holes.map((hole) => hole.map((p) => ({ ...p }))) }));
  const tol = Math.max(0.01, tolerance);

  let ringCount = 0;
  const points: Point[] = [];
  const pointRing: number[] = [];
  const starts: number[][] = [];
  const ringBase: number[] = [];
  const addRing = (ringPoints: Point[]) => {
    const ringId = ringCount++;
    for (const point of ringPoints) {
      points.push(point);
      pointRing.push(ringId);
    }
  };
  regions.forEach((region, regionIndex) => {
    starts[regionIndex] = [];
    starts[regionIndex].push(points.length);
    ringBase[regionIndex] = ringCount;
    addRing(region.coords);
    region.holes.forEach((hole, holeIndex) => {
      starts[regionIndex][holeIndex + 1] = points.length;
      addRing(hole);
    });
  });

  const parent = new Int32Array(points.length);
  for (let index = 0; index < parent.length; index++) parent[index] = index;
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const cells = new Map<string, number[]>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / tol)},${Math.floor(y / tol)}`;
  points.forEach((point, index) => {
    const cx = Math.floor(point.x / tol);
    const cy = Math.floor(point.y / tol);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = cells.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          // Only merge vertices that belong to different rings. Two corners of
          // the same ring can legitimately sit closer than the tolerance (a
          // spike, a narrow neck); averaging them would erase real geometry.
          if (pointRing[other] === pointRing[index]) continue;
          if (Math.hypot(points[other].x - point.x, points[other].y - point.y) <= tol) union(index, other);
        }
      }
    }
    const key = cellKey(point.x, point.y);
    const bucket = cells.get(key);
    if (bucket) bucket.push(index);
    else cells.set(key, [index]);
  });

  const sums = new Map<number, { x: number; y: number; n: number }>();
  points.forEach((point, index) => {
    const root = find(index);
    const entry = sums.get(root) ?? { x: 0, y: 0, n: 0 };
    entry.x += point.x;
    entry.y += point.y;
    entry.n++;
    sums.set(root, entry);
  });
  const nodes = new Map<number, Point>();
  for (const [root, sum] of sums) nodes.set(root, { x: sum.x / sum.n, y: sum.y / sum.n });

  const nodeList = [...new Set(points.map((_, index) => find(index)))];
  const nodePoints = nodeList.map((root) => nodes.get(root)!);
  const snappedPoints = points.map((_, index) => nodes.get(find(index))!);

  // Which rings own each shared node. A node owned only by the ring being
  // rebuilt must not be dragged onto its own segment: that turns a sharp bend
  // into a spurious T-junction (and sometimes a self-intersection).
  const nodeOwners = new Map<number, Set<number>>();
  points.forEach((_, index) => {
    const root = find(index);
    let owners = nodeOwners.get(root);
    if (!owners) {
      owners = new Set<number>();
      nodeOwners.set(root, owners);
    }
    owners.add(pointRing[index]);
  });

  const nodeCells = new Map<string, number[]>();
  const nodeCellSize = Math.max(2, tol * 4);
  nodeList.forEach((root, index) => {
    const point = nodePoints[index];
    const key = `${Math.floor(point.x / nodeCellSize)},${Math.floor(point.y / nodeCellSize)}`;
    const bucket = nodeCells.get(key);
    if (bucket) bucket.push(index);
    else nodeCells.set(key, [index]);
  });

  const replaceRing = (start: number, length: number, ringId: number): Point[] => {
    const original: Point[] = [];
    for (let index = 0; index < length; index++) original.push(snappedPoints[start + index]);
    const rebuilt: Point[] = [];
    for (let index = 0; index < original.length; index++) {
      const a = original[index];
      const b = original[(index + 1) % original.length];
      rebuilt.push(a);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-7) continue;

      const minX = Math.min(a.x, b.x) - tol;
      const maxX = Math.max(a.x, b.x) + tol;
      const minY = Math.min(a.y, b.y) - tol;
      const maxY = Math.max(a.y, b.y) + tol;
      const candidates: Array<{ t: number; point: Point }> = [];
      for (let cy = Math.floor(minY / nodeCellSize); cy <= Math.floor(maxY / nodeCellSize); cy++) {
        for (let cx = Math.floor(minX / nodeCellSize); cx <= Math.floor(maxX / nodeCellSize); cx++) {
          const bucket = nodeCells.get(`${cx},${cy}`);
          if (!bucket) continue;
          for (const nodeIndex of bucket) {
            const point = nodePoints[nodeIndex];
            if (Math.hypot(point.x - a.x, point.y - a.y) < 1e-6) continue;
            if (Math.hypot(point.x - b.x, point.y - b.y) < 1e-6) continue;
            const owners = nodeOwners.get(nodeList[nodeIndex]);
            if (owners && owners.size === 1 && owners.has(ringId)) continue;
            const projection = projectOnSegment(point, a, b);
            if (projection.distance <= tol && projection.t > 0.001 && projection.t < 0.999) {
              candidates.push({ t: projection.t, point });
            }
          }
        }
      }
      candidates.sort((left, right) => left.t - right.t);
      for (const candidate of candidates) rebuilt.push(candidate.point);
    }

    const clean: Point[] = [];
    for (const point of rebuilt) {
      const last = clean[clean.length - 1];
      if (last && Math.hypot(last.x - point.x, last.y - point.y) < 1e-7) continue;
      clean.push(point);
    }
    if (clean.length > 2) {
      const first = clean[0];
      const last = clean[clean.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-7) clean.pop();
    }
    return clean.length >= 3 ? clean : original;
  };

  return regions.map((region, regionIndex) => ({
    ...region,
    coords: replaceRing(starts[regionIndex][0], region.coords.length, ringBase[regionIndex]),
    holes: region.holes.map((hole, holeIndex) =>
      replaceRing(
        starts[regionIndex][holeIndex + 1],
        hole.length,
        ringBase[regionIndex] + 1 + holeIndex,
      ),
    ),
  }));
}
