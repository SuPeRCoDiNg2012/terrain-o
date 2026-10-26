import { describe, expect, it, vi } from 'vitest';
import { autoReportSummary, runAutoPipeline, type AutoStage } from './autoPipeline';

describe('one-click pipeline runner', () => {
  it('runs every stage in order and reports monotonic progress', async () => {
    const order: string[] = [];
    const progress: number[] = [];
    const stages: AutoStage[] = [
      { id: 'one', label: 'Uno', weight: 1, run: async () => (order.push('one'), { ok: true, count: 2 }) },
      { id: 'two', label: 'Due', weight: 2, run: async () => (order.push('two'), { ok: true }) },
      { id: 'three', label: 'Tre', weight: 1, run: async () => (order.push('three'), { ok: true }) },
    ];

    const outcome = await runAutoPipeline(stages, {
      onProgress: (percent) => progress.push(percent),
    });

    expect(order).toEqual(['one', 'two', 'three']);
    expect(outcome.completed).toEqual(['one', 'two', 'three']);
    expect(outcome.cancelled).toBe(false);
    expect(progress.length).toBeGreaterThanOrEqual(6);
    for (let index = 1; index < progress.length; index++) {
      expect(progress[index]).toBeGreaterThanOrEqual(progress[index - 1]);
    }
    expect(progress[progress.length - 1]).toBe(100);
  });

  it('skips unavailable stages without calling them', async () => {
    const blocked = vi.fn(async () => ({ ok: true }));
    const outcome = await runAutoPipeline([
      { id: 'osm', label: 'OSM', weight: 1, skip: () => 'nessuna georeferenziazione', run: blocked },
      { id: 'ai', label: 'AI', weight: 1, run: async () => ({ ok: true }) },
    ]);

    expect(blocked).not.toHaveBeenCalled();
    expect(outcome.skipped).toEqual([{ id: 'osm', reason: 'nessuna georeferenziazione' }]);
    expect(outcome.completed).toEqual(['ai']);
  });

  it('continues after a failure and surfaces the warning', async () => {
    const outcome = await runAutoPipeline([
      {
        id: 'osm',
        label: 'OSM',
        weight: 1,
        run: async () => {
          throw new Error('rete non disponibile');
        },
      },
      { id: 'ai', label: 'AI', weight: 1, run: async () => ({ ok: true }) },
    ]);

    expect(outcome.completed).toEqual(['ai']);
    expect(outcome.warnings).toEqual(['OSM: rete non disponibile']);
  });

  it('stops between stages when cancelled', async () => {
    let cancelled = false;
    const second = vi.fn(async () => ({ ok: true }));
    const outcome = await runAutoPipeline(
      [
        {
          id: 'one',
          label: 'Uno',
          weight: 1,
          run: async () => {
            cancelled = true;
            return { ok: true };
          },
        },
        { id: 'two', label: 'Due', weight: 1, run: second },
      ],
      { isCancelled: () => cancelled },
    );

    expect(second).not.toHaveBeenCalled();
    expect(outcome.cancelled).toBe(true);
    expect(outcome.completed).toEqual(['one']);
  });

  it('summarises the report without claiming verification', () => {
    const summary = autoReportSummary({
      osmWays: 10,
      osmFeatures: 8,
      classified: true,
      classificationSize: '1024×1024',
      polygons: 12,
      aiFeatures: 5,
      buildings: 2,
      trees: 3,
      contours: 4,
      fusedRemoved: 1,
      totalFeatures: 24,
      warnings: [],
      durationMs: 2500,
    });
    expect(summary).toContain('24 simboli totali');
    expect(summary).toContain('2.5 s');
    expect(summary.toLowerCase()).not.toContain('verificat');
  });
});
