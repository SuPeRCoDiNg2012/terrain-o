import type { OsmSemantic } from './semantic';

export function osmAreaStyle(semantic: OsmSemantic): { fill: string; stroke: string } {
  switch (semantic) {
    case 'building':
      return { fill: 'rgba(150, 150, 150, 0.32)', stroke: '#7d7d7d' };
    case 'water':
      return { fill: 'rgba(59, 130, 184, 0.30)', stroke: '#2b6cb0' };
    case 'forest':
      return { fill: 'rgba(63, 143, 75, 0.26)', stroke: '#3f6b3a' };
    case 'scrub':
      return { fill: 'rgba(90, 140, 70, 0.22)', stroke: '#5a7d46' };
    case 'open':
      return { fill: 'rgba(200, 169, 60, 0.20)', stroke: '#a08a3c' };
    case 'wetland':
      return { fill: 'rgba(72, 132, 150, 0.20)', stroke: '#4a8a9a' };
    case 'artificial':
      return { fill: 'rgba(150, 150, 150, 0.16)', stroke: '#8a8a8a' };
    default:
      return { fill: 'rgba(140, 140, 140, 0.14)', stroke: '#7a7a7a' };
  }
}

export function osmLineStyle(semantic: OsmSemantic): { stroke: string; width: number; dash?: number[] } {
  switch (semantic) {
    case 'road':
      return { stroke: '#b45309', width: 2.2 };
    case 'path':
      return { stroke: '#be185d', width: 1.3, dash: [4, 3] };
    case 'stream':
      return { stroke: '#0284c7', width: 1.5 };
    case 'railway':
      return { stroke: '#4a4a4a', width: 1.8, dash: [7, 4] };
    case 'barrier':
      return { stroke: '#4a4a4a', width: 1.1, dash: [5, 3] };
    default:
      return { stroke: '#7a7a7a', width: 1.2 };
  }
}
