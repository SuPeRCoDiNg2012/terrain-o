/**
 * One-click automation.
 *
 * The runner is deliberately independent from the store and from the browser:
 * stages are injected, so ordering, progress, cancellation and failure
 * resilience can be unit-tested without workers or IndexedDB.
 */

export interface AutoPipelineOptions {
  /** Download OSM when the project is georeferenced. */
  fetchOsm: boolean;
  /** Generate DEM contour lines when the project is georeferenced. */
  contours: boolean;
  /** Vectorize the rule classification. */
  vectorize: boolean;
  /** Run the local machine-learning recognizer. */
  recognize: boolean;
}

export const DEFAULT_AUTO_OPTIONS: AutoPipelineOptions = {
  fetchOsm: true,
  contours: true,
  vectorize: true,
  recognize: true,
};

export interface AutoStageResult {
  ok: boolean;
  /** Number of produced items, for the final report. */
  count?: number;
  /** A non-fatal problem that must be shown but must not stop the pipeline. */
  warning?: string;
}

export interface AutoStage {
  id: string;
  label: string;
  /** Relative duration used to spread the progress bar. */
  weight: number;
  /** Returns a reason string when the stage cannot run at all. */
  skip?: () => string | null;
  run: () => Promise<AutoStageResult>;
}

export interface AutoPipelineCallbacks {
  onProgress?: (percent: number, phase: string) => void;
  isCancelled?: () => boolean;
}

export interface AutoPipelineOutcome {
  completed: string[];
  skipped: Array<{ id: string; reason: string }>;
  warnings: string[];
  cancelled: boolean;
  /** Wall-clock duration, useful for the report. */
  durationMs: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAutoPipeline(
  stages: AutoStage[],
  callbacks: AutoPipelineCallbacks = {},
): Promise<AutoPipelineOutcome> {
  const started = Date.now();
  const completed: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const warnings: string[] = [];
  const totalWeight = Math.max(1, stages.reduce((sum, stage) => sum + Math.max(0.1, stage.weight), 0));
  let doneWeight = 0;
  const cancelled = () => callbacks.isCancelled?.() === true;

  for (const stage of stages) {
    if (cancelled()) {
      return { completed, skipped, warnings, cancelled: true, durationMs: Date.now() - started };
    }

    const skipReason = stage.skip?.() ?? null;
    if (skipReason) {
      skipped.push({ id: stage.id, reason: skipReason });
      doneWeight += Math.max(0.1, stage.weight);
      callbacks.onProgress?.((doneWeight / totalWeight) * 100, stage.label);
      continue;
    }

    callbacks.onProgress?.((doneWeight / totalWeight) * 100, stage.label);
    try {
      const result = await stage.run();
      if (result.ok) completed.push(stage.id);
      if (result.warning) warnings.push(result.warning);
      if (cancelled()) {
        return { completed, skipped, warnings, cancelled: true, durationMs: Date.now() - started };
      }
    } catch (error) {
      if (cancelled()) {
        return { completed, skipped, warnings, cancelled: true, durationMs: Date.now() - started };
      }
      // A failed stage never destroys the work of the previous stages: record
      // the problem and let the remaining independent stages try.
      warnings.push(`${stage.label}: ${messageOf(error)}`);
    }
    doneWeight += Math.max(0.1, stage.weight);
    callbacks.onProgress?.((doneWeight / totalWeight) * 100, stage.label);
  }

  return {
    completed,
    skipped,
    warnings,
    cancelled: cancelled(),
    durationMs: Date.now() - started,
  };
}

export interface AutoPipelineReport {
  osmWays: number;
  osmFeatures: number;
  classified: boolean;
  classificationSize: string | null;
  polygons: number;
  aiFeatures: number;
  buildings: number;
  trees: number;
  contours: number;
  fusedRemoved: number;
  totalFeatures: number;
  warnings: string[];
  durationMs: number;
}

export function autoReportSummary(report: AutoPipelineReport): string {
  const parts = [
    `${report.osmWays} OSM`,
    `${report.osmFeatures} elementi OSM`,
    report.classified ? `classificazione ${report.classificationSize ?? 'pronta'}` : 'classificazione assente',
    `${report.polygons} aree vettoriali`,
    `${report.aiFeatures} simboli AI`,
    `${report.buildings} edifici`,
    `${report.trees} alberi`,
    `${report.contours} curve`,
    `${report.fusedRemoved} duplicati uniti`,
    `${report.totalFeatures} simboli totali`,
  ];
  return `${parts.join(' · ')} · ${(report.durationMs / 1000).toFixed(1)} s`;
}
