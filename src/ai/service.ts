import type { ClassificationParams, Project } from '../model/types';
import { extractPixels } from '../classify/service';
import { workingSize } from '../classify/classify';
import type { AiRequest, AiResponse } from '../classify/protocol';
import type { AiRecognitionOptions, AiRecognitionOutput } from './recognize';
import { buildTrainingLabels } from './trainingLabels';

export interface AiProgressInfo {
  percent: number;
  phase: string;
}

export function recognizeSource(
  image: HTMLImageElement,
  project: Project,
  params: ClassificationParams,
  options: AiRecognitionOptions,
  callbacks: {
    onProgress?: (info: AiProgressInfo) => void;
    signal?: AbortSignal;
  } = {},
): Promise<AiRecognitionOutput> {
  return new Promise((resolve, reject) => {
    if (!project.image) {
      reject(new Error('Importare prima un’immagine sorgente.'));
      return;
    }
    if (callbacks.signal?.aborted) {
      reject(new DOMException('Operazione annullata', 'AbortError'));
      return;
    }

    const target = workingSize(project.image.width, project.image.height, params.maxWorkSide ?? 2048);
    const data = extractPixels(image, project.image.width, project.image.height, target.width, target.height);
    callbacks.onProgress?.({ percent: 1, phase: 'Preparazione esempi' });
    const training = buildTrainingLabels(project, target.width, target.height);

    const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
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
    const onAbort = () => finish(() => reject(new DOMException('Riconoscimento annullato', 'AbortError')));
    callbacks.signal?.addEventListener('abort', onAbort, { once: true });

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'Errore nel worker di riconoscimento.')));
    };
    worker.onmessage = (event: MessageEvent<AiResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === 'progress') {
        callbacks.onProgress?.({ percent: message.percent, phase: message.phase });
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error(message.message)));
        return;
      }
      finish(() =>
        resolve({
          labels: new Uint8Array(message.labels),
          confidence: new Float32Array(message.confidence),
          trees: message.trees,
          stats: message.stats,
          width: message.width,
          height: message.height,
        }),
      );
    };

    const request: AiRequest = {
      type: 'ai-recognize',
      id,
      width: target.width,
      height: target.height,
      pixels: data.data.buffer.slice(0),
      trainLabels: training.labels.buffer.slice(0),
      trainWeights: training.weights.buffer.slice(0),
      params,
      options,
    };
    worker.postMessage(request, [request.pixels, request.trainLabels, request.trainWeights]);
  });
}
