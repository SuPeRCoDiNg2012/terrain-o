import { describe, expect, it } from 'vitest';
import { createFeature } from './constants';
import { validateProject } from './schema';
import { makeTestProject } from '../test/fixtures';

describe('project schema · AI metadata', () => {
  it('accepts ML features, confidence and AI/fusion reports', () => {
    const project = makeTestProject();
    project.features = [
      createFeature('point', 'tree', [{ x: 20, y: 30 }], {
        source: 'ml',
        mlConfidence: 0.82,
        mergedFrom: ['feature-a'],
      }),
    ];
    project.ai = {
      createdAt: new Date().toISOString(),
      samples: 120,
      labelledSamples: 80,
      validation: 86.5,
      classes: 5,
      polygons: 12,
      buildings: 3,
      trees: 9,
      method: 'test',
      featureImportance: [{ name: 'a*', value: 0.4 }],
    };
    project.symbolFusion = {
      createdAt: new Date().toISOString(),
      before: 20,
      after: 18,
      removed: 2,
      mergedGroups: 2,
      protectedConflicts: 0,
      byType: { building: 3, tree: 9 },
    };

    const parsed = validateProject(project);
    expect(parsed.features[0]).toMatchObject({ source: 'ml', mlConfidence: 0.82 });
    expect(parsed.ai?.buildings).toBe(3);
    expect(parsed.symbolFusion?.after).toBe(18);
  });

  it('still accepts projects saved before the AI fields existed', () => {
    const project = makeTestProject();
    expect(project.ai).toBeUndefined();
    expect(project.symbolFusion).toBeUndefined();
    expect(() => validateProject(project)).not.toThrow();
  });
});
