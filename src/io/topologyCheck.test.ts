import { describe, expect, it } from 'vitest';
import { createFeature } from '../model/constants';
import { makeTestProject } from '../test/fixtures';
import { exportProjectGeoJson } from './exportGeoJson';
import { exportProjectOmap } from './exportOmap';
import { projectTopologyProblems } from './topologyCheck';

describe('export topology pre-check', () => {
  it('accepts a simple rectangle', () => {
    const project = makeTestProject();
    project.features = [
      createFeature('area', 'forest', [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 80 },
        { x: 10, y: 80 },
      ]),
    ];
    expect(projectTopologyProblems(project)).toEqual([]);
    expect(() => exportProjectGeoJson(project)).not.toThrow();
    expect(() => exportProjectOmap(project)).not.toThrow();
  });

  it('blocks GeoJSON and OMAP when an area self-intersects', () => {
    const project = makeTestProject();
    project.features = [
      createFeature('area', 'forest', [
        { x: 10, y: 10 },
        { x: 110, y: 90 },
        { x: 110, y: 10 },
        { x: 10, y: 90 },
      ]),
    ];
    expect(projectTopologyProblems(project)[0]).toMatch(/auto-intersecante/i);
    expect(() => exportProjectGeoJson(project)).toThrow(/topologia non valida/i);
    expect(() => exportProjectOmap(project)).toThrow(/topologia non valida/i);
  });

  it('blocks a hole that is outside its outer ring', () => {
    const project = makeTestProject();
    project.features = [
      createFeature(
        'area',
        'forest',
        [
          { x: 10, y: 10 },
          { x: 100, y: 10 },
          { x: 100, y: 100 },
          { x: 10, y: 100 },
        ],
        {
          holes: [
            [
              { x: 200, y: 200 },
              { x: 240, y: 200 },
              { x: 240, y: 240 },
              { x: 200, y: 240 },
            ],
          ],
        },
      ),
    ];
    expect(projectTopologyProblems(project)[0]).toMatch(/non contenuto/i);
  });
});
