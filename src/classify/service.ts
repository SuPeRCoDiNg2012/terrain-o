import type { ClassificationParams, ClassificationStats } from '../model/types';
import type { ClassifyRequest, ClassifyResponse } from './protocol';
import { get2d, createCanvas } from '../render/canvas';
import { workingSize } from './classify';

export interface ClassificationOutput {
  overlay: Uint8ClampedArray;
  labels: Uint8Array;
  confidence: Float32Array;
  stats: ClassificationStats;
  width: number;
  height: number;
}

export interface ProgressInfo {
  percent: number;
  phase: string;
}

function extractPixels(
  image: HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  offsetX = 0,
  offsetY = 0,
): ImageData {
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = get2d(canvas);
  ctx.drawImage(image, offsetX, offsetY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
}

export function classifySource(
  image: HTMLImageElement,
  width: number,
  height: number,
  params: ClassificationParams,
  callbacks: { onProgress?: (info: ProgressInfo) => void; signal?: AbortSignal; preview?: boolean } = {},
): Promise<ClassificationOutput> {
  return new Promise((resolve, reject) => {
    if (callbacks.signal?.aborted) {
      reject(new DOMException('Operazione annullata', 'AbortError'));
      return;
    }
    // Draw directly at the working resolution. Extracting a 10000×10000 RGBA
    // buffer only to downsample it in the worker would allocate ~400 MB per run.
    const target = workingSize(width, height, params.maxWorkSide ?? 2048);
    const data = extractPixels(image, width, height, target.width, target.height);
    const worker = new Worker(new URL('./classify.worker.ts', import.meta.url), { type: 'module' });
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
    const onAbort = () => {
      finish(() => reject(new DOMException('Classificazione annullata', 'AbortError')));
    };
    callbacks.signal?.addEventListener('abort', onAbort, { once: true });

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'Errore nel worker di classificazione.')));
    };
    worker.onmessage = (event: MessageEvent<ClassifyResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        callbacks.onProgress?.({ percent: msg.percent, phase: msg.phase });
        return;
      }
      if (msg.type === 'error') {
        finish(() => reject(new Error(msg.message)));
        return;
      }
      const output: ClassificationOutput = {
        overlay: new Uint8ClampedArray(msg.overlay),
        labels: new Uint8Array(msg.labels),
        confidence: new Float32Array(msg.confidence),
        stats: msg.stats,
        width: msg.width,
        height: msg.height,
      };
      finish(() => resolve(output));
    };

    const request: ClassifyRequest = {
      type: 'classify',
      id,
      width: target.width,
      height: target.height,
      pixels: data.data.buffer.slice(0),
      // The buffer is already at working resolution; avoid a second reduction.
      params: { ...params, maxWorkSide: Math.max(target.width, target.height) },
      preview: callbacks.preview,
    };
    worker.postMessage(request, [request.pixels]);
  });
}

export function previewClassification(
  image: HTMLImageElement,
  params: ClassificationParams,
  signal?: AbortSignal,
): Promise<ClassificationOutput & { dataURL: string }> {
  const maxSide = 320;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  return classifySource(image, width, height, params, { signal, preview: true }).then((output) => {
    const canvas = createCanvas(output.width, output.height);
    const ctx = get2d(canvas);
    ctx.putImageData(new ImageData(output.overlay, output.width, output.height), 0, 0);
    return { ...output, dataURL: canvas.toDataURL('image/png') };
  });
}
