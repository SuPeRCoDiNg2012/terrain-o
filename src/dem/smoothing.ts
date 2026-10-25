import type { Point } from '../model/types';

/** Chaikin smoothing for contour polylines (open or closed). */
export function applySmoothing(points: Point[], _tolerance: number, iterations: number, closed: boolean): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  let line = points.map((point) => ({ ...point }));
  const count = Math.max(0, Math.min(3, Math.round(iterations)));
  for (let iteration = 0; iteration < count; iteration++) {
    if (line.length < 3) break;
    const output: Point[] = [];
    if (!closed) output.push(line[0]);
    const last = closed ? line.length : line.length - 1;
    for (let index = 0; index < last; index++) {
      const a = line[index];
      const b = line[(index + 1) % line.length];
      output.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
    }
    if (!closed) output.push(line[line.length - 1]);
    line = output;
  }
  return line;
}
