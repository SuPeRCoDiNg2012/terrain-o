import type { BBox, ContourLine } from '../model/types';
import type { DemContourRequest, DemResponse } from '../classify/protocol';
import { createCanvas, get2d } from '../render/canvas';

const MAX_TILES = 16;
const tileCache = new Map<string, ImageData>();

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}

function tileRange(bbox: BBox, zoom: number) {
  const minX = lonToTileX(bbox.west, zoom);
  const maxX = lonToTileX(bbox.east, zoom);
  const minY = latToTileY(bbox.north, zoom);
  const maxY = latToTileY(bbox.south, zoom);
  return { minX, maxX, minY, maxY, count: (maxX - minX + 1) * (maxY - minY + 1) };
}

function chooseZoom(bbox: BBox): number {
  const midLat = (bbox.south + bbox.north) / 2;
  const metersPerPixelAtZoom0 = 156543.03392 * Math.cos((midLat * Math.PI) / 180);
  let zoom = Math.max(10, Math.min(14, Math.floor(Math.log2(metersPerPixelAtZoom0 / 30))));
  while (zoom > 10 && tileRange(bbox, zoom).count > MAX_TILES) zoom--;
  const range = tileRange(bbox, zoom);
  if (range.count > 64) {
    throw new Error('Area troppo estesa per il DEM: ridurre il bbox o georeferenziare un\'area più piccola.');
  }
  return zoom;
}

function tileUrl(z: number, x: number, y: number): string {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Operazione annullata', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Operazione annullata', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function decodeTile(blob: Blob): Promise<ImageData> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const ctx = get2d(canvas);
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    return data;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Tessera DEM non decodificabile.'));
      img.src = url;
    });
    const canvas = createCanvas(image.naturalWidth, image.naturalHeight);
    const ctx = get2d(canvas);
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<ImageData> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Operazione annullata', 'AbortError');
    try {
      const response = await fetch(tileUrl(z, x, y), { signal, mode: 'cors' });
      if (!response.ok) throw new Error(`Tessera DEM HTTP ${response.status}`);
      const blob = await response.blob();
      const data = await decodeTile(blob);
      tileCache.set(key, data);
      return data;
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      lastError = error;
      await delay(600 * 2 ** attempt + Math.random() * 250, signal);
    }
  }
  throw new Error(
    `Impossibile scaricare le tessere DEM (${lastError instanceof Error ? lastError.message : String(lastError)}). Riprovare più tardi.`,
  );
}

export async function generateContours(
  bbox: BBox,
  imageWidth: number,
  imageHeight: number,
  interval: number,
  callbacks: { onProgress?: (percent: number, phase: string) => void; signal?: AbortSignal } = {},
): Promise<{ lines: ContourLine[]; minElevation: number; maxElevation: number }> {
  const zoom = chooseZoom(bbox);
  const range = tileRange(bbox, zoom);
  const tiles: DemContourRequest['tiles'] = [];
  const total = range.count;
  let loaded = 0;
  callbacks.onProgress?.(2, 'Selezione tessere DEM');
  for (let y = range.minY; y <= range.maxY; y++) {
    for (let x = range.minX; x <= range.maxX; x++) {
      if (callbacks.signal?.aborted) throw new DOMException('Operazione annullata', 'AbortError');
      const data = await fetchTile(zoom, x, y, callbacks.signal);
      tiles.push({
        x,
        y,
        z: zoom,
        size: data.width,
        pixels: data.data.buffer.slice(0),
      });
      loaded++;
      callbacks.onProgress?.(2 + Math.round((loaded / total) * 18), `Download tessere DEM ${loaded}/${total}`);
    }
  }
  callbacks.onProgress?.(22, 'Calcolo curve di livello');

  const worker = new Worker(new URL('./dem.worker.ts', import.meta.url), { type: 'module' });
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
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
    const onAbort = () => finish(() => reject(new DOMException('Operazione annullata', 'AbortError')));
    callbacks.signal?.addEventListener('abort', onAbort, { once: true });
    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'Errore nel worker DEM.')));
    worker.onmessage = (event: MessageEvent<DemResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        callbacks.onProgress?.(msg.percent, msg.phase);
        return;
      }
      if (msg.type === 'error') {
        finish(() => reject(new Error(msg.message)));
        return;
      }
      finish(() =>
        resolve({
          lines: msg.lines.map((line) => ({
            elevation: line.elevation,
            coords: line.coords,
            closed: line.closed,
            index: line.index,
          })),
          minElevation: msg.minElevation,
          maxElevation: msg.maxElevation,
        }),
      );
    };
    const request: DemContourRequest = {
      type: 'dem',
      id,
      width: imageWidth,
      height: imageHeight,
      gridWidth: 256,
      gridHeight: 256,
      west: bbox.west,
      south: bbox.south,
      east: bbox.east,
      north: bbox.north,
      interval,
      tiles,
    };
    const transfers = tiles.map((tile) => tile.pixels);
    worker.postMessage(request, transfers);
  });
}
