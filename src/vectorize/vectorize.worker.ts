/// <reference lib="webworker" />
import { vectorize } from './pipeline';
import type { VectorizeRequest, VectorizeResponse } from '../classify/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const STAGE_LABELS: Record<string, string> = {
  masks: 'Lettura maschere',
  contours: 'Estrazione contorni',
  topology: 'Topologia e fori',
  simplify: 'Semplificazione',
  reconcile: 'Riconciliazione bordi',
  filter: 'Filtro geometrie',
};

ctx.onmessage = (event: MessageEvent<VectorizeRequest>) => {
  const msg = event.data;
  if (msg.type !== 'vectorize') return;
  try {
    const labels = new Uint8Array(msg.labels);
    const confidence = msg.confidence ? new Float32Array(msg.confidence) : null;
    const result = vectorize(
      { labels, width: msg.width, height: msg.height, confidence },
      msg.options,
      {
        onProgress: (stage, percent) => {
          ctx.postMessage({
            type: 'progress',
            id: msg.id,
            phase: STAGE_LABELS[stage] ?? stage,
            percent,
          } satisfies VectorizeResponse);
        },
      },
    );
    ctx.postMessage({
      type: 'result',
      id: msg.id,
      regions: result.regions,
      stats: result.stats,
    } satisfies VectorizeResponse);
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id: msg.id,
      message: error instanceof Error ? error.message : String(error),
    } satisfies VectorizeResponse);
  }
};
