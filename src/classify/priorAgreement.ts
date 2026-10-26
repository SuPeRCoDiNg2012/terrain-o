import type { ClassificationOsmAgreement } from '../model/types';
import type { ClassPriorMap } from './types';

const CLASS_TO_KEY = { 1: 'veg', 2: 'open', 3: 'water', 4: 'art' } as const;

function emptyReport(): ClassificationOsmAgreement {
  return {
    overall: 0,
    covered: 0,
    priorPixels: 0,
    byClass: { veg: 0, open: 0, water: 0, art: 0 },
    classPixels: { veg: 0, open: 0, water: 0, art: 0 },
  };
}

function percent(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

/**
 * Compares the final labels with the OSM prior that guided them. Pixels below
 * the minimum strength (paths, trees, thin barriers) are excluded so the
 * percentage describes real land-cover agreement, not a line hint.
 */
export function computePriorAgreement(
  labels: Uint8Array,
  prior: ClassPriorMap,
  minimumStrength = 0.25,
): ClassificationOsmAgreement {
  const report = emptyReport();
  if (labels.length !== prior.width * prior.height) return report;
  const total = new Uint32Array(5);
  const matches = new Uint32Array(5);
  let priorPixels = 0;
  let agreed = 0;
  for (let pixel = 0; pixel < labels.length; pixel++) {
    if (prior.strength[pixel] < minimumStrength) continue;
    const priorClass = prior.classes[pixel];
    if (priorClass < 1 || priorClass > 4) continue;
    priorPixels++;
    total[priorClass]++;
    if (labels[pixel] === priorClass) {
      matches[priorClass]++;
      agreed++;
    }
  }
  report.priorPixels = priorPixels;
  report.overall = percent(agreed, priorPixels);
  report.covered = percent(priorPixels, labels.length);
  for (const classId of [1, 2, 3, 4] as const) {
    const key = CLASS_TO_KEY[classId];
    report.classPixels[key] = total[classId];
    report.byClass[key] = percent(matches[classId], total[classId]);
  }
  return report;
}
