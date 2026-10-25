import type { VectorizeRequest, VectorizeResponse } from '../classify/protocol';
import {
  DEFAULT_VECTORIZE_OPTIONS,
  type PolygonalRegion,
  type VectorizeOptions,
  type VectorizeResult,
} from './types';

export type { PolygonalRegion, VectorizeOptions, VectorizeResult } from './types';

interface CallbackOptions {
  onProgress?: (percent: number, phase: string) => void;
  signal?: AbortSignal;
  preview?: boolean;
}

function runWorker(
  labels: Uint8Array,
  width: number,
  height: number,
  options: VectorizeOptions,
  confidence: Float32Array | null,
  callbacks: CallbackOptions,
): Promise<VectorizeResult> {
  return new Promise((resolve, reject) => {
    if (callbacks.signal?.aborted) {
      reject(new DOMException('Operazione annullata', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./vectorize.worker.ts', import.meta.url), { type: 'module' });
    const id = crypto.randomUUID();
    let settled = false;

    const cleanup = () => {
      callbacks.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onAbort = () => finish(() => reject(new DOMException('Vettorizzazione annullata', 'AbortError')));
    callbacks.signal?.addEventListener('abort', onAbort, { once: true });

    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'Errore nel worker di vettorizzazione.')));
    worker.onmessage = (event: MessageEvent<VectorizeResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === 'progress') {
        callbacks.onProgress?.(message.percent, message.phase);
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error(message.message)));
        return;
      }
      finish(() => resolve({ regions: message.regions, stats: message.stats }));
    };

    const copied = labels.slice();
    const confidenceCopy = confidence ? confidence.slice() : null;
    const request: VectorizeRequest = {
      type: 'vectorize',
      id,
      width,
      height,
      labels: copied.buffer,
      ...(confidenceCopy ? { confidence: confidenceCopy.buffer } : {}),
      options,
    };
    const transfer: Transferable[] = [request.labels];
    if (request.confidence) transfer.push(request.confidence);
    worker.postMessage(request, transfer);
  });
}

export function vectorizeLabelsDetailed(
  labels: Uint8Array,
  width: number,
  height: number,
  options: VectorizeOptions,
  callbacks: CallbackOptions = {},
  confidence: Float32Array | null = null,
): Promise<VectorizeResult> {
  return runWorker(labels, width, height, { ...DEFAULT_VECTORIZE_OPTIONS, ...options }, confidence, callbacks);
}

export function vectorizeLabels(
  labels: Uint8Array,
  width: number,
  height: number,
  options: VectorizeOptions,
  callbacks: CallbackOptions = {},
  confidence: Float32Array | null = null,
): Promise<PolygonalRegion[]> {
  return vectorizeLabelsDetailed(labels, width, height, options, callbacks, confidence).then((result) => result.regions);
}
