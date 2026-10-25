import { createEmptyProject, createFeature } from '../model/constants';
import type { Project } from '../model/types';

export function makeTestProject(overrides: Partial<Project> = {}): Project {
  const project = createEmptyProject('Progetto di test');
  project.image = {
    assetId: 'asset-1',
    name: 'test.jpg',
    width: 1000,
    height: 800,
    originalWidth: 1000,
    originalHeight: 800,
    mimeType: 'image/jpeg',
  };
  project.worldFile = { A: 0.00001, D: 0, B: 0, E: -0.00001, C: 11, F: 46 };
  project.projectionWKT = null;
  project.projectionSource = 'assumed-wgs84';
  project.imageBBox = { west: 11, south: 45.992, east: 11.01, north: 46 };
  project.calibration = {
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    meters: 100,
    mPerPx: 1,
    method: 'two-point',
  };
  return { ...project, ...overrides };
}

export function makeFeatureSet(project: Project): Project {
  const area = createFeature('area', 'forest', [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 260 },
    { x: 100, y: 260 },
  ], { name: 'Bosco test', verified: false });
  const line = createFeature('line', 'path', [
    { x: 400, y: 100 },
    { x: 500, y: 180 },
    { x: 620, y: 260 },
  ], { name: 'Sentiero test' });
  const start = createFeature('point', 'start', [{ x: 150, y: 400 }], { order: 0 });
  const control = createFeature('point', 'control', [{ x: 350, y: 500 }], {
    order: 1,
    code: '101',
    name: 'Controllo 101',
  });
  const finish = createFeature('point', 'finish', [{ x: 700, y: 600 }], { order: 2 });
  return { ...project, features: [area, line, start, control, finish] };
}

/** Small deterministic 8x8 PNG (base64) for import smoke checks. */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=';
