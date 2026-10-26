import type { Point, Project } from '../model/types';
import { cleanRing, rasterizeRings } from '../osm/priorMap';
import { isClosedWay, osmSemanticOf } from '../osm/semantic';

/**
 * Training labels for the local model at working resolution.
 *
 * Only geometry that already exists in the project is used: OSM areas and
 * features drawn/imported by the user. The classifier's own output is never
 * fed back here; rule labels are added later, with a lower weight, by the
 * recognizer. This prevents the model from simply memorizing its predecessor.
 */
export interface TrainingLabelSet {
  labels: Uint8Array;
  weights: Float32Array;
  /** Number of pixels per class, useful for the training report. */
  pixels: Record<number, number>;
}

const CLASS_BY_TYPE: Record<string, number> = {
  forest: 1,
  thicket: 1,
  open: 2,
  water: 3,
  building: 5,
  artificial: 4,
};

function classForSemantic(semantic: string): number | null {
  switch (semantic) {
    case 'building':
      return 5;
    case 'water':
    case 'wetland':
      return 3;
    case 'forest':
    case 'scrub':
      return 1;
    case 'open':
      return 2;
    case 'artificial':
      return 4;
    default:
      return null;
  }
}

function featureClass(type: string): number | null {
  return CLASS_BY_TYPE[type] ?? null;
}

export function buildTrainingLabels(
  project: Project,
  width: number,
  height: number,
): TrainingLabelSet {
  const labels = new Uint8Array(width * height);
  const weights = new Float32Array(width * height);
  const pixels: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (width <= 0 || height <= 0 || !project.image) return { labels, weights, pixels };

  const scaleX = width / project.image.width;
  const scaleY = height / project.image.height;
  const projectRing = (ring: Point[]): Point[] =>
    ring.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));

  const paint = (rings: Point[][], classId: number, weight: number) => {
    const cleaned = rings.filter((ring) => ring.length >= 3);
    if (!cleaned.length) return;
    rasterizeRings(cleaned, width, height, (pixel) => {
      if (weight <= weights[pixel]) return;
      labels[pixel] = classId;
      weights[pixel] = weight;
    });
  };

  // Raw OSM areas are the main source of named examples. Buildings map to the
  // dedicated building class (5), everything else to its cover family.
  for (const way of project.osmWays) {
    const info = osmSemanticOf(way);
    const classId = classForSemantic(info.semantic);
    if (classId == null || !info.area || !isClosedWay(way) || !way.coords.length) continue;
    const outer = cleanRing(projectRing(way.coords));
    if (outer.length < 3) continue;
    const rings = [outer];
    for (const hole of way.holes ?? []) {
      const ring = cleanRing(projectRing(hole));
      if (ring.length >= 3) rings.push(ring);
    }
    paint(rings, classId, Math.max(0.5, info.priorWeight));
  }

  // Manual geometry is the strongest supervision available: the user drew it
  // deliberately, and it is usually better aligned than third-party data.
  for (const feature of project.features) {
    if (feature.kind !== 'area' || feature.source === 'ml' || feature.coords.length < 3) continue;
    const classId = featureClass(feature.type);
    if (classId == null) continue;
    const rings = [cleanRing(projectRing(feature.coords))];
    for (const hole of feature.holes ?? []) {
      const ring = cleanRing(projectRing(hole));
      if (ring.length >= 3) rings.push(ring);
    }
    const manual = feature.source == null || feature.source === 'manual';
    paint(rings, classId, manual ? 3 : feature.source === 'osm' ? 1.1 : 0.5);
  }

  for (let pixel = 0; pixel < labels.length; pixel++) {
    if (labels[pixel] > 0) pixels[labels[pixel]]++;
  }
  return { labels, weights, pixels };
}
