import { z } from 'zod';
import { DEFAULT_LAYERS, DEFAULT_LAYER_ORDER, SCHEMA_VERSION, makeId } from './constants';
import type { Project, ProjectFile } from './types';

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const worldFileSchema = z.object({
  A: z.number().finite(),
  D: z.number().finite(),
  B: z.number().finite(),
  E: z.number().finite(),
  C: z.number().finite(),
  F: z.number().finite(),
});

const bboxSchema = z.object({
  west: z.number().finite(),
  south: z.number().finite(),
  east: z.number().finite(),
  north: z.number().finite(),
});

const layerSchema = z.object({
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
});

const verificationEventSchema = z.object({
  at: z.string().min(1),
  note: z.string(),
  reason: z.string(),
  action: z.enum(['verified', 'revoked']),
});

const featureSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['area', 'line', 'point']),
  type: z.string().min(1),
  name: z.string(),
  notes: z.string(),
  verified: z.boolean(),
  verifiedNote: z.string(),
  history: z.array(verificationEventSchema),
  coords: z.array(pointSchema).min(1),
  holes: z.array(z.array(pointSchema).min(3)).optional(),
  order: z.number().int().optional(),
  code: z.string().optional(),
  source: z.enum(['manual', 'osm', 'vector', 'gpx', 'dem']).optional(),
  osmId: z.number().optional(),
});

const imageSchema = z.object({
  assetId: z.string().min(1),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  originalWidth: z.number().int().positive(),
  originalHeight: z.number().int().positive(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

const classificationStatsSchema = z.object({
  unc: z.number().min(0).max(100),
  veg: z.number().min(0).max(100),
  open: z.number().min(0).max(100),
  water: z.number().min(0).max(100),
  art: z.number().min(0).max(100),
});

const classificationParamsSchema = z.object({
  grayBalance: z.number().min(0).max(1),
  vegetationHueMin: z.number().min(0).max(360),
  vegetationHueMax: z.number().min(0).max(360),
  vegetationSatMin: z.number().min(0).max(1),
  waterHueMin: z.number().min(0).max(360),
  waterHueMax: z.number().min(0).max(360),
  waterSatMin: z.number().min(0).max(1),
  waterValueMax: z.number().min(0).max(1),
  artificialSatMax: z.number().min(0).max(1),
  artificialValueMin: z.number().min(0).max(1),
  openHueMin: z.number().min(0).max(360),
  openHueMax: z.number().min(0).max(360),
  openSatMin: z.number().min(0).max(1),
  smoothing: z.number().int().min(0).max(3),
  tileSize: z.number().int().min(16).max(256).optional(),
  localBalance: z.number().min(0).max(1).optional(),
  slicCompactness: z.number().min(1).max(80).optional(),
  slicIterations: z.number().int().min(1).max(12).optional(),
  superpixelSize: z.number().int().min(6).max(96).optional(),
  majorityWindow: z.number().int().min(1).max(9).optional(),
  minComponentPx: z.number().int().min(0).max(100000).optional(),
  fillHoles: z.boolean().optional(),
  textureWeight: z.number().min(0).max(1).optional(),
  edgeWeight: z.number().min(0).max(1).optional(),
  maxWorkSide: z.number().int().min(256).max(8192).optional(),
  waterBMax: z.number().min(-80).max(20).optional(),
  vegAMax: z.number().min(-60).max(20).optional(),
  openBMin: z.number().min(0).max(80).optional(),
  artChromaMax: z.number().min(0).max(40).optional(),
});

const classificationSchema = z.object({
  assetId: z.string().min(1),
  method: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string().min(1),
  stats: classificationStatsSchema,
  params: classificationParamsSchema,
});

const calibrationSampleSchema = z.object({
  a: pointSchema,
  b: pointSchema,
  meters: z.number().positive(),
});

const calibrationSchema = z.object({
  a: pointSchema,
  b: pointSchema,
  meters: z.number().positive(),
  mPerPx: z.number().positive(),
  method: z.enum(['two-point', 'least-squares']),
  extraSamples: z.array(calibrationSampleSchema).optional(),
});

const osmWaySchema = z.object({
  id: z.number(),
  kind: z.enum(['highway', 'waterway']),
  highway: z.string().optional(),
  waterway: z.string().optional(),
  name: z.string().optional(),
  coords: z.array(pointSchema).min(2),
});

const contourSchema = z.object({
  elevation: z.number().finite(),
  coords: z.array(pointSchema).min(2),
  closed: z.boolean(),
  index: z.boolean(),
});

const projectSchema = z.object({
  schema: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  image: imageSchema.nullable(),
  worldFile: worldFileSchema.nullable(),
  projectionWKT: z.string().nullable(),
  projectionSource: z.enum(['wkt', 'assumed-wgs84', 'degrees', 'none']),
  imageBBox: bboxSchema.nullable(),
  calibration: calibrationSchema.nullable(),
  printScale: z.number().int().positive(),
  orientation: z.literal('source'),
  showNorth: z.boolean(),
  classification: classificationSchema.nullable(),
  layers: z.object({
    source: layerSchema,
    classification: layerSchema,
    contours: layerSchema,
    osm: layerSchema,
    features: layerSchema,
    course: layerSchema,
  }),
  layerOrder: z.array(z.enum(['source', 'classification', 'contours', 'osm', 'features', 'course'])),
  features: z.array(featureSchema),
  osmWays: z.array(osmWaySchema),
  contours: z.array(contourSchema),
  contourInterval: z.number().positive(),
  course: z.object({ showLines: z.boolean() }),
  geoWarnings: z.array(z.string()),
});

const assetFileSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['source', 'classification', 'labels']),
  mimeType: z.string().optional(),
  dataURL: z.string().optional(),
  labelsBase64: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const projectFileSchema = z.object({
  app: z.literal('Terrain / O'),
  appVersion: z.string(),
  exportedAt: z.string(),
  project: projectSchema,
  assets: z.array(assetFileSchema),
});

export class ProjectValidationError extends Error {
  issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'ProjectValidationError';
    this.issues = issues;
  }
}

function cleanLayerOrder(value: unknown): unknown {
  if (!Array.isArray(value)) return [...DEFAULT_LAYER_ORDER];
  const allowed = new Set(DEFAULT_LAYER_ORDER);
  const filtered = value.filter((v): v is string => typeof v === 'string' && allowed.has(v as never));
  for (const id of DEFAULT_LAYER_ORDER) if (!filtered.includes(id)) filtered.push(id);
  return filtered;
}

/**
 * Normalises legacy single-file proof-of-concept projects and extracts embedded
 * data URLs into separate assets. The project on disk never carries raster data.
 */
export function normalizeProjectInput(input: unknown): {
  project: unknown;
  embeddedAssets: ProjectFile['assets'];
} {
  if (!input || typeof input !== 'object') {
    throw new ProjectValidationError('Il file non contiene un oggetto JSON valido.');
  }
  const root = input as Record<string, any>;
  const raw = (root.project ?? root) as Record<string, any>;
  const embeddedAssets: ProjectFile['assets'] = Array.isArray(root.assets) ? [...root.assets] : [];

  const project = structuredClone(raw);
  project.schema = SCHEMA_VERSION;
  project.id ||= makeId();
  project.name ||= 'Progetto importato';
  project.createdAt ||= new Date().toISOString();
  project.updatedAt ||= project.createdAt;
  project.projectionSource ||= project.worldFile ? 'assumed-wgs84' : 'none';
  project.projectionWKT ??= null;
  project.imageBBox ??= null;
  project.calibration ??= null;
  project.printScale ||= 15000;
  project.orientation = 'source';
  project.showNorth ??= true;
  project.classification ??= null;
  project.features = Array.isArray(project.features) ? project.features : [];
  project.osmWays = Array.isArray(project.osmWays) ? project.osmWays : [];
  project.contours = Array.isArray(project.contours) ? project.contours : [];
  project.contourInterval ||= 10;
  project.course ??= { showLines: true };
  project.geoWarnings = Array.isArray(project.geoWarnings) ? project.geoWarnings : [];
  project.layers = { ...DEFAULT_LAYERS, ...(project.layers ?? {}) };
  for (const key of DEFAULT_LAYER_ORDER) {
    project.layers[key] = {
      visible: project.layers[key]?.visible ?? DEFAULT_LAYERS[key].visible,
      opacity: project.layers[key]?.opacity ?? DEFAULT_LAYERS[key].opacity,
    };
  }
  project.layerOrder = cleanLayerOrder(project.layerOrder);

  if (project.image && typeof project.image === 'object') {
    if (typeof project.image.dataURL === 'string') {
      const id = project.image.assetId || makeId();
      embeddedAssets.push({
        id,
        kind: 'source',
        mimeType: project.image.mimeType || 'image/jpeg',
        dataURL: project.image.dataURL,
        width: project.image.width,
        height: project.image.height,
      });
      project.image.assetId = id;
      delete project.image.dataURL;
    }
    project.image.mimeType ||= 'image/jpeg';
    project.image.originalWidth ||= project.image.width;
    project.image.originalHeight ||= project.image.height;
  }

  if (project.classification && typeof project.classification === 'object') {
    if (typeof project.classification.dataURL === 'string') {
      const id = project.classification.assetId || project.classification.id || makeId();
      embeddedAssets.push({
        id,
        kind: 'classification',
        mimeType: 'image/png',
        dataURL: project.classification.dataURL,
        width: project.classification.width,
        height: project.classification.height,
      });
      project.classification.assetId = id;
      delete project.classification.dataURL;
      delete project.classification.id;
    }
    project.classification.assetId ||= makeId();
  }

  if (Array.isArray(project.features)) {
    project.features = project.features.map((feature: Record<string, any>) => ({
      id: feature.id || makeId(),
      kind: feature.kind || 'line',
      type: feature.type || 'path',
      name: feature.name || '',
      notes: feature.notes || '',
      verified: Boolean(feature.verified),
      verifiedNote: feature.verifiedNote || '',
      history: Array.isArray(feature.history) ? feature.history : [],
      coords: Array.isArray(feature.coords) ? feature.coords : [],
      holes: Array.isArray(feature.holes) ? feature.holes : undefined,
      order: feature.order,
      code: feature.code,
      source: feature.source || 'manual',
      osmId: feature.osmId,
    }));
  }

  return { project, embeddedAssets };
}

export function parseProjectFile(input: unknown): {
  project: Project;
  assets: ProjectFile['assets'];
} {
  const { project, embeddedAssets } = normalizeProjectInput(input);
  const result = projectSchema.safeParse(project);
  if (!result.success) {
    throw new ProjectValidationError(
      'Il file di progetto non è valido o è corrotto.',
      result.error.issues.map((i) => `${i.path.join('.') || 'radice'}: ${i.message}`),
    );
  }
  return { project: result.data as Project, assets: embeddedAssets };
}

export function validateProject(project: Project): Project {
  const result = projectSchema.safeParse(project);
  if (!result.success) {
    throw new ProjectValidationError(
      'Il progetto contiene dati non validi.',
      result.error.issues.map((i) => `${i.path.join('.') || 'radice'}: ${i.message}`),
    );
  }
  return result.data as Project;
}

export function validateProjectFile(project: Project, assets: ProjectFile['assets']): ProjectFile {
  const file: ProjectFile = {
    app: 'Terrain / O',
    appVersion: '0.5.0',
    exportedAt: new Date().toISOString(),
    project: validateProject(project),
    assets,
  };
  return projectFileSchema.parse(file) as ProjectFile;
}
