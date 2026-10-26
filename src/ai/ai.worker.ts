/// <reference lib="webworker" />
import type { AiRequest, AiResponse } from '../classify/protocol';
import { recognizeSymbols } from './recognize';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<AiRequest>) => {
  const message = event.data;
  if (message.type !== 'ai-recognize') return;
  try {
    const result = recognizeSymbols(
      {
        rgba: new Uint8ClampedArray(message.pixels),
        width: message.width,
        height: message.height,
        params: message.params,
        trainLabels: new Uint8Array(message.trainLabels),
        trainWeights: new Float32Array(message.trainWeights),
        options: message.options,
      },
      {
        onProgress: (percent, phase) => {
          ctx.postMessage({ type: 'progress', id: message.id, phase, percent } satisfies AiResponse);
        },
      },
    );
    const response: AiResponse = {
      type: 'result',
      id: message.id,
      labels: result.labels.buffer,
      confidence: result.confidence.buffer,
      trees: result.trees,
      stats: result.stats,
      width: result.width,
      height: result.height,
    };
    ctx.postMessage(response, [response.labels, response.confidence]);
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    } satisfies AiResponse);
  }
};
