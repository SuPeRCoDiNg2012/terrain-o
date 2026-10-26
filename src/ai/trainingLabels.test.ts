import { describe, expect, it } from 'vitest';
import { createFeature } from '../model/constants';
import type { OsmWay } from '../model/types';
import { makeTestProject } from '../test/fixtures';
import { buildTrainingLabels } from './trainingLabels';

function ring(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
}

describe('AI training labels', () => {
  it('rasterizes OSM buildings as class 5 and manual areas with a stronger weight', () => {
    const project = makeTestProject();
    const building: OsmWay = {
      id: 77,
      kind: 'building',
      building: 'yes',
      coords: ring(100, 100, 300, 260),
    };
    project.osmWays = [building];
    project.features = [
      createFeature('area', 'forest', ring(400, 400, 600, 600), { source: 'manual' }),
    ];

    const result = buildTrainingLabels(project, 100, 80);
    expect(result.labels[18 * 100 + 20]).toBe(5);
    expect(result.labels[50 * 100 + 50]).toBe(1);
    expect(result.weights[18 * 100 + 20]).toBeGreaterThan(0.4);
    expect(result.weights[50 * 100 + 50]).toBeGreaterThan(result.weights[18 * 100 + 20]);
    expect(result.pixels[5]).toBeGreaterThan(0);
    expect(result.pixels[1]).toBeGreaterThan(0);
    expect(result.pixels[2]).toBe(0);
  });

  it('returns an empty label set without image geometry', () => {
    const project = makeTestProject({ image: null });
    const result = buildTrainingLabels(project, 20, 20);
    expect(result.labels.every((value) => value === 0)).toBe(true);
    expect(result.pixels).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});
