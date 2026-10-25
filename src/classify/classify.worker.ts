/// <reference lib="webworker" />
import { classifyPixels } from './classify';
import type { ClassifyRequest, ClassifyResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<ClassifyRequest>) => {
  const msg = event.data;
  if (msg.type !== 'classify') return;
  try {
    const rgba = new Uint8ClampedArray(msg.pixels);
    const result = classifyPixels(rgba, msg.width, msg.height, msg.params, (percent, phase) => {
      ctx.postMessage({ type: 'progress', id: msg.id, phase, percent } satisfies ClassifyResponse);
    });
    const response: ClassifyResponse = {
      type: 'result',
      id: msg.id,
      overlay: result.overlay.buffer,
      labels: result.labels.buffer,
      confidence: result.confidence.buffer,
      stats: result.stats,
      width: result.width,
      height: result.height,
    };
    ctx.postMessage(response, [response.overlay, response.labels, response.confidence]);
  } catch (error) {
    const response: ClassifyResponse = {
      type: 'error',
      id: msg.id,
      message: error instanceof Error ? error.message : String(error),
    };
    ctx.postMessage(response);
  }
};
