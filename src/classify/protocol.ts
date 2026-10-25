import type { ClassificationParams, ClassificationStats, Point } from '../model/types';
import type { PolygonalRegion, VectorizeOptions, VectorizeStats } from '../vectorize/types';

export interface ClassifyRequest {
  type: 'classify';
  id: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  params: ClassificationParams;
  preview?: boolean;
}

export type ClassifyResponse =
  | { type: 'progress'; id: string; phase: string; percent: number }
  | {
      type: 'result';
      id: string;
      overlay: ArrayBuffer;
      labels: ArrayBuffer;
      confidence: ArrayBuffer;
      stats: ClassificationStats;
      width: number;
      height: number;
    }
  | { type: 'error'; id: string; message: string };

export interface VectorizeRequest {
  type: 'vectorize';
  id: string;
  width: number;
  height: number;
  labels: ArrayBuffer;
  confidence?: ArrayBuffer;
  options: VectorizeOptions;
}

export type VectorizedRegion = PolygonalRegion;

export type VectorizeResponse =
  | { type: 'progress'; id: string; phase: string; percent: number }
  | { type: 'result'; id: string; regions: PolygonalRegion[]; stats: VectorizeStats }
  | { type: 'error'; id: string; message: string };

export interface DemContourRequest {
  type: 'dem';
  id: string;
  width: number;
  height: number;
  gridWidth: number;
  gridHeight: number;
  west: number;
  south: number;
  east: number;
  north: number;
  interval: number;
  tiles: Array<{
    x: number;
    y: number;
    z: number;
    size: number;
    pixels: ArrayBuffer;
  }>;
}

export interface DemContourResultLine {
  elevation: number;
  coords: Point[];
  closed: boolean;
  index: boolean;
}

export type DemResponse =
  | { type: 'progress'; id: string; phase: string; percent: number }
  | { type: 'result'; id: string; lines: DemContourResultLine[]; minElevation: number; maxElevation: number }
  | { type: 'error'; id: string; message: string };
