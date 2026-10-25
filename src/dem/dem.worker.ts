/// <reference lib="webworker" />
import type { DemContourRequest, DemResponse, DemContourResultLine } from '../classify/protocol';
import type { Point } from '../model/types';
import { marchingSquares, stitchSegments } from './marchingSquares';
import { applySmoothing } from './smoothing';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function lonLatToGlobal(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 256 * 2 ** zoom;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * n,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n,
  };
}

function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

ctx.onmessage = (event: MessageEvent<DemContourRequest>) => {
  const msg = event.data;
  if (msg.type !== 'dem') return;
  try {
    const tileMap = new Map<string, { pixels: Uint8ClampedArray; size: number }>();
    for (const tile of msg.tiles) {
      tileMap.set(`${tile.z}/${tile.x}/${tile.y}`, {
        pixels: new Uint8ClampedArray(tile.pixels),
        size: tile.size,
      });
    }
    const zoom = msg.tiles[0]?.z ?? 13;
    const cols = msg.gridWidth;
    const rows = msg.gridHeight;
    const values = new Float32Array(cols * rows);
    let missing = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lon = msg.west + (col / (cols - 1)) * (msg.east - msg.west);
        const lat = msg.north - (row / (rows - 1)) * (msg.north - msg.south);
        const global = lonLatToGlobal(lon, lat, zoom);
        const tileX = Math.floor(global.x / 256);
        const tileY = Math.floor(global.y / 256);
        const tile = tileMap.get(`${zoom}/${tileX}/${tileY}`);
        if (!tile) {
          values[row * cols + col] = NaN;
          missing++;
          continue;
        }
        const localX = global.x - tileX * 256;
        const localY = global.y - tileY * 256;
        const x0 = Math.max(0, Math.min(tile.size - 1, Math.floor(localX)));
        const y0 = Math.max(0, Math.min(tile.size - 1, Math.floor(localY)));
        const x1 = Math.min(tile.size - 1, x0 + 1);
        const y1 = Math.min(tile.size - 1, y0 + 1);
        const fx = localX - x0;
        const fy = localY - y0;
        const sample = (x: number, y: number) => {
          const i = (y * tile.size + x) * 4;
          return decodeTerrarium(tile.pixels[i], tile.pixels[i + 1], tile.pixels[i + 2]);
        };
        values[row * cols + col] =
          sample(x0, y0) * (1 - fx) * (1 - fy) +
          sample(x1, y0) * fx * (1 - fy) +
          sample(x0, y1) * (1 - fx) * fy +
          sample(x1, y1) * fx * fy;
      }
      if (row % Math.max(1, Math.floor(rows / 10)) === 0) {
        ctx.postMessage({
          type: 'progress',
          id: msg.id,
          phase: 'Campionamento DEM',
          percent: Math.round((row / rows) * 25),
        } satisfies DemResponse);
      }
    }
    if (missing / (cols * rows) > 0.4) {
      throw new Error('Troppi campioni DEM mancanti: area non coperta dalle tessere. Ridurre il bbox o riprovare.');
    }
    // Fill isolated gaps from neighbours so contour tracing stays continuous.
    if (missing > 0) {
      for (let i = 0; i < values.length; i++) {
        if (Number.isFinite(values[i])) continue;
        let sum = 0;
        let count = 0;
        const row = Math.floor(i / cols);
        const col = i % cols;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = col + dx;
          const y = row + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const v = values[y * cols + x];
          if (Number.isFinite(v)) {
            sum += v;
            count++;
          }
        }
        if (count) values[i] = sum / count;
      }
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (Number.isFinite(v)) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('Nessun dato altimetrico disponibile.');
    const levels: number[] = [];
    const start = Math.ceil(min / msg.interval) * msg.interval;
    for (let level = start; level <= max; level += msg.interval) levels.push(Math.round(level * 1000) / 1000);
    if (levels.length > 80) {
      throw new Error(
        `Intervallo troppo fitto: ${levels.length} curve. Aumentare l'equidistanza per questa area.`,
      );
    }
    const lines: DemContourResultLine[] = [];
    levels.forEach((level, index) => {
      const segments = marchingSquares({ values, cols, rows }, level);
      const isolines = stitchSegments(segments);
      for (const line of isolines) {
        if (line.coords.length < 2) continue;
        const px: Point[] = line.coords.map((p) => ({
          x: (p.x / (cols - 1)) * msg.width,
          y: (p.y / (rows - 1)) * msg.height,
        }));
        const smoothed = applySmoothing(px, 0.8, 1, line.closed);
        if (smoothed.length < 2) continue;
        lines.push({
          elevation: level,
          coords: smoothed,
          closed: line.closed,
          index: Math.round(level / msg.interval) % 5 === 0,
        });
      }
      if (index % 5 === 0 || index === levels.length - 1) {
        ctx.postMessage({
          type: 'progress',
          id: msg.id,
          phase: `Curve di livello ${level} m`,
          percent: 25 + Math.round(((index + 1) / levels.length) * 75),
        } satisfies DemResponse);
      }
    });
    ctx.postMessage({
      type: 'result',
      id: msg.id,
      lines,
      minElevation: min,
      maxElevation: max,
    } satisfies DemResponse);
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id: msg.id,
      message: error instanceof Error ? error.message : String(error),
    } satisfies DemResponse);
  }
};
