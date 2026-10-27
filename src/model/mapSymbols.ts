import type { FeatureKind, MapStandard, Project } from './types';

/**
 * Central symbol identity for the two IOF standards used by Terrain / O.
 * Codes follow ISOM 2017-2 and ISSprOM 2019-2. The .omap bridge resolves the
 * same codes against the official OpenOrienteering Mapper definitions, while
 * the canvas uses one consistent screen style for both standards.
 */
export type SymbolKey =
  | 'forest'
  | 'thicket'
  | 'open'
  | 'water'
  | 'building'
  | 'artificial'
  | 'road'
  | 'path'
  | 'stream'
  | 'fence'
  | 'tree'
  | 'start'
  | 'control'
  | 'finish'
  | 'contour'
  | 'indexContour'
  | 'controlNumber'
  | 'courseLine';

interface SymbolIdentity {
  code: string;
  name: string;
  kind: FeatureKind | 'text' | 'contour';
}

const ISOM: Record<SymbolKey, SymbolIdentity> = {
  forest: { code: '405', name: 'Forest', kind: 'area' },
  thicket: { code: '410', name: 'Dense vegetation', kind: 'area' },
  open: { code: '401', name: 'Open land', kind: 'area' },
  water: { code: '301', name: 'Uncrossable body of water', kind: 'area' },
  building: { code: '521', name: 'Building', kind: 'area' },
  artificial: { code: '501', name: 'Paved area', kind: 'area' },
  road: { code: '503', name: 'Road', kind: 'line' },
  path: { code: '505', name: 'Footpath', kind: 'line' },
  stream: { code: '304', name: 'Crossable watercourse', kind: 'line' },
  fence: { code: '516', name: 'Fence', kind: 'line' },
  tree: { code: '417', name: 'Prominent large tree', kind: 'point' },
  start: { code: '701', name: 'Start', kind: 'point' },
  control: { code: '703', name: 'Control point', kind: 'point' },
  finish: { code: '706', name: 'Finish', kind: 'point' },
  contour: { code: '101', name: 'Contour', kind: 'contour' },
  indexContour: { code: '102', name: 'Index contour', kind: 'contour' },
  controlNumber: { code: '704', name: 'Control number', kind: 'text' },
  courseLine: { code: '705', name: 'Course line', kind: 'line' },
};

const ISSPROM: Record<SymbolKey, SymbolIdentity> = {
  ...ISOM,
  path: { code: '505.1', name: 'Unpaved footpath', kind: 'line' },
  road: { code: '501.17', name: 'Paved road, heavy traffic', kind: 'line' },
  stream: { code: '305', name: 'Small crossable watercourse', kind: 'line' },
  thicket: { code: '410', name: 'Impassable vegetation', kind: 'area' },
};

const BY_STANDARD: Record<MapStandard, Record<SymbolKey, SymbolIdentity>> = {
  isom: ISOM,
  issprom: ISSPROM,
};

/**
 * OOM definitions are split into fill and edge symbols for water, paved areas
 * and sprint buildings. The first code is the fill/line/point that carries the
 * object, the second one is an optional companion outline.
 */
const COMPANIONS: Record<MapStandard, Partial<Record<SymbolKey, string>>> = {
  isom: {
    water: '301.4',
    artificial: '501.2',
  },
  issprom: {
    water: '301.6',
    artificial: '501.1',
    building: '521.4',
  },
};

/** Fill symbol used for sprint buildings; ISOM 521 is already a solid fill. */
const PRIMARY_OVERRIDES: Record<MapStandard, Partial<Record<SymbolKey, string>>> = {
  isom: {},
  issprom: {
    water: '301.1',
    artificial: '501.5',
    building: '521.3',
  },
};

export function projectStandard(project: Pick<Project, 'mapStandard'>): MapStandard {
  return project.mapStandard === 'issprom' ? 'issprom' : 'isom';
}

export function isSymbolKey(type: string): type is SymbolKey {
  return type in ISOM;
}

export function symbolIdentity(type: string, standard: MapStandard): SymbolIdentity | null {
  if (!isSymbolKey(type)) return null;
  return BY_STANDARD[standard][type];
}

/** Human readable code for labels such as "405 · Forest". */
export function symbolCode(type: string, standard: MapStandard): string | null {
  return symbolIdentity(type, standard)?.code ?? null;
}

/** All OOM definitions needed to draw one feature, fill first. */
export function exportSymbolCodes(type: string, standard: MapStandard): string[] {
  if (!isSymbolKey(type)) return [];
  const primary = PRIMARY_OVERRIDES[standard][type] ?? BY_STANDARD[standard][type].code;
  const companion = COMPANIONS[standard][type];
  return companion ? [primary, companion] : [primary];
}

export interface CanvasSymbolStyle {
  fill?: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  dash?: [number, number];
  pointRadius?: number;
  pointFill?: string;
}

const PURPLE = '#8a1f8a';
const BLACK = '#141414';

const STYLES: Partial<Record<SymbolKey, CanvasSymbolStyle>> = {
  forest: { fill: '#f4f1e5', fillOpacity: 0.62, stroke: 'transparent', strokeWidth: 0 },
  thicket: { fill: '#3f9b3f', fillOpacity: 0.7, stroke: 'transparent', strokeWidth: 0 },
  open: { fill: '#f2d050', fillOpacity: 0.66, stroke: 'transparent', strokeWidth: 0 },
  water: { fill: '#67b3dd', fillOpacity: 0.8, stroke: BLACK, strokeWidth: 0.9 },
  building: { fill: '#181818', fillOpacity: 0.92, stroke: 'transparent', strokeWidth: 0 },
  artificial: { fill: '#d9c7a7', fillOpacity: 0.82, stroke: BLACK, strokeWidth: 0.8 },
  road: { stroke: BLACK, strokeWidth: 3.4 },
  path: { stroke: BLACK, strokeWidth: 1.6, dash: [5, 3] },
  stream: { stroke: '#2a7fb8', strokeWidth: 2.2 },
  fence: { stroke: BLACK, strokeWidth: 1.2 },
  tree: { stroke: '#2f8f45', strokeWidth: 2.2, pointRadius: 4.8, pointFill: '#f7f5ec' },
  start: { stroke: PURPLE, strokeWidth: 2.2 },
  control: { stroke: PURPLE, strokeWidth: 2.2 },
  finish: { stroke: PURPLE, strokeWidth: 2.2 },
};

export function featureStyle(type: string, standard: MapStandard): CanvasSymbolStyle {
  const key = isSymbolKey(type) ? type : null;
  const base = key ? STYLES[key] : undefined;
  if (base) {
    // Sprint roads and paths are drawn slightly wider on screen to match the
    // larger footprints of the ISSprOM 2019-2 specification.
    if (standard === 'issprom' && key === 'road') return { ...base, strokeWidth: 3.8 };
    if (standard === 'issprom' && key === 'path') return { ...base, strokeWidth: 2 };
    return base;
  }
  // Unknown types stay visible but intentionally neutral: they are not an
  // official IOF symbol and the UI must not imply that they are.
  return { stroke: '#6b7280', strokeWidth: 1.5 };
}

export const COURSE_PURPLE = PURPLE;
export const CONTOUR_BROWN = '#9c5a2c';
export const INDEX_CONTOUR_BROWN = '#6f3e1c';
