import type {
  ClassificationParams,
  Feature,
  FeatureKind,
  LayerId,
  Project,
  VerificationEvent,
} from './types';

export const APP_VERSION = '0.5.0';
export const SCHEMA_VERSION = 'terrain-o/1.0' as const;
export const MAX_IMAGE_SIDE = 4096;
export const DEFAULT_PRINT_SCALE = 15000;
export const DEFAULT_CONTOUR_INTERVAL = 10;
export const MAX_UNDO = 50;

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const DEM_ATTRIBUTION = 'DEM: AWS Terrain Tiles (Mapzen Terrarium, dati indicativi)';
export const PRELIMINARY_WARNING =
  'BOZZA PRELIMINARE — non atta alla gara. Nessuna garanzia di percorribilità, vegetazione sotto copertura, sicurezza, quota o conformità IOF.';

export const PROVENANCE_NOTES = [
  {
    label: 'Immagine sorgente',
    text: "Ortofoto originale: non viene mai modificata, è solo visualizzata come sfondo.",
    tone: 'source',
  },
  {
    label: 'Interpretazione automatica',
    text: 'Classificazione, riconoscimento AI, curve di livello e strade OSM sono sperimentali e indicativi. Non sono verità sul terreno.',
    tone: 'auto',
  },
  {
    label: 'Elementi manuali',
    text: 'Geometrie disegnate o corrette a mano. Stato predefinito: non verificato.',
    tone: 'manual',
  },
  {
    label: 'Elementi verificati',
    text: 'Solo dopo una dichiarazione esplicita di verifica sul campo. Ogni modifica geometrica revoca la verifica.',
    tone: 'verified',
  },
] as const;

export interface TypeSpec {
  label: string;
  short: string;
  color: string;
  fill?: string;
  kind: FeatureKind;
  isomCode?: string;
  defaultName: string;
}

export const AREA_TYPES: Record<string, TypeSpec> = {
  forest: {
    label: 'Bosco',
    short: 'Bosco',
    color: '#3f6b3a',
    fill: '#8fc36a',
    kind: 'area',
    isomCode: '410',
    defaultName: 'Bosco',
  },
  thicket: {
    label: 'Vegetazione fitta',
    short: 'Veg. fitta',
    color: '#2c4a29',
    fill: '#4e7d49',
    kind: 'area',
    isomCode: '410',
    defaultName: 'Vegetazione fitta',
  },
  open: {
    label: 'Terreno aperto',
    short: 'Aperto',
    color: '#a08a3c',
    fill: '#e8d9a0',
    kind: 'area',
    isomCode: '310',
    defaultName: 'Terreno aperto',
  },
  water: {
    label: 'Acqua',
    short: 'Acqua',
    color: '#2b6cb0',
    fill: '#8fc6e8',
    kind: 'area',
    isomCode: '301',
    defaultName: 'Acqua',
  },
  building: {
    label: 'Edificio',
    short: 'Edificio',
    color: '#444444',
    fill: '#a9a9a9',
    kind: 'area',
    isomCode: '521',
    defaultName: 'Edificio',
  },
  artificial: {
    label: 'Superficie artificiale',
    short: 'Artificiale',
    color: '#6b6b6b',
    fill: '#d4d1ca',
    kind: 'area',
    isomCode: '501',
    defaultName: 'Superficie artificiale',
  },
};

export const LINE_TYPES: Record<string, TypeSpec> = {
  path: {
    label: 'Sentiero',
    short: 'Sentiero',
    color: '#8a4a1f',
    kind: 'line',
    isomCode: '505',
    defaultName: 'Sentiero',
  },
  road: {
    label: 'Strada',
    short: 'Strada',
    color: '#6b4226',
    kind: 'line',
    isomCode: '502',
    defaultName: 'Strada',
  },
  stream: {
    label: 'Ruscello',
    short: 'Ruscello',
    color: '#2b6cb0',
    kind: 'line',
    isomCode: '304',
    defaultName: 'Ruscello',
  },
  fence: {
    label: 'Recinzione',
    short: 'Recinzione',
    color: '#4a4a4a',
    kind: 'line',
    isomCode: '516',
    defaultName: 'Recinzione',
  },
};

export const POINT_TYPES: Record<string, TypeSpec> = {
  start: {
    label: 'Partenza',
    short: 'Partenza',
    color: '#6b21a8',
    kind: 'point',
    isomCode: '701',
    defaultName: 'Partenza',
  },
  control: {
    label: 'Controllo',
    short: 'Controllo',
    color: '#b91c1c',
    kind: 'point',
    isomCode: '703',
    defaultName: 'Controllo',
  },
  finish: {
    label: 'Arrivo',
    short: 'Arrivo',
    color: '#6b21a8',
    kind: 'point',
    isomCode: '706',
    defaultName: 'Arrivo',
  },
  tree: {
    label: 'Albero isolato',
    short: 'Albero',
    color: '#2f6b3a',
    kind: 'point',
    defaultName: 'Albero isolato',
  },
};

export const COURSE_TYPES = new Set(['start', 'control', 'finish']);

export function typeSpec(type: string): TypeSpec {
  return (
    AREA_TYPES[type] ??
    LINE_TYPES[type] ?? 
    POINT_TYPES[type] ?? {
      label: type,
      short: type,
      color: '#555555',
      kind: 'line',
      defaultName: type,
    }
  );
}

export function typeKind(type: string): FeatureKind {
  return typeSpec(type).kind;
}

export const LAYER_DEFS: Record<
  LayerId,
  { label: string; provenance: 'source' | 'auto' | 'user'; hint: string }
> = {
  source: {
    label: 'Immagine sorgente',
    provenance: 'source',
    hint: "Ortofoto non modificabile. Origine di ogni geometria.",
  },
  classification: {
    label: 'Classificazione',
    provenance: 'auto',
    hint: 'Interpretazione automatica, non verificata.',
  },
  contours: {
    label: 'Curve di livello',
    provenance: 'auto',
    hint: 'Da DEM pubblico a circa 30 m: quota indicativa, non di precisione.',
  },
  osm: {
    label: 'OSM (grezzo)',
    provenance: 'auto',
    hint: 'Tracciati OpenStreetMap da verificare sul campo.',
  },
  features: {
    label: 'Elementi cartografici',
    provenance: 'user',
    hint: 'Tratteggiato automatico, pieno manuale, spunta verificato.',
  },
  course: {
    label: 'Percorso e controlli',
    provenance: 'user',
    hint: 'Partenza, controlli e arrivo. La lunghezza è solo geometrica.',
  },
};

export const DEFAULT_LAYER_ORDER: LayerId[] = [
  'source',
  'classification',
  'contours',
  'osm',
  'features',
  'course',
];

export const DEFAULT_LAYERS: Project['layers'] = {
  source: { visible: true, opacity: 1 },
  classification: { visible: false, opacity: 0.65 },
  contours: { visible: false, opacity: 0.8 },
  osm: { visible: false, opacity: 0.9 },
  features: { visible: true, opacity: 1 },
  course: { visible: true, opacity: 1 },
};

export const DEFAULT_CLASSIFICATION_PARAMS: ClassificationParams = {
  grayBalance: 0.55,
  vegetationHueMin: 55,
  vegetationHueMax: 175,
  vegetationSatMin: 0.12,
  waterHueMin: 170,
  waterHueMax: 268,
  waterSatMin: 0.2,
  waterValueMax: 0.86,
  artificialSatMax: 0.14,
  artificialValueMin: 0.2,
  openHueMin: 20,
  openHueMax: 70,
  openSatMin: 0.1,
  smoothing: 1,
  tileSize: 64,
  localBalance: 0.85,
  slicCompactness: 12,
  slicIterations: 4,
  superpixelSize: 24,
  majorityWindow: 2,
  minComponentPx: 48,
  fillHoles: true,
  textureWeight: 0.35,
  edgeWeight: 0.25,
  maxWorkSide: 2048,
  waterBMax: -10,
  vegAMax: -6,
  openBMin: 18,
  artChromaMax: 10,
  osmPriorEnabled: true,
  osmPriorWeight: 0.55,
};

export const CLASSIFICATION_METHOD =
  'pipeline locale L*a*b* + SLIC + regole ISOM con confidenza e morfologia; prior OSM opzionale (non ML, materia prima sperimentale)';

export const AI_METHOD =
  'random forest locale su superpixel, addestrato da OSM, elementi manuali e pseudo-etichette; output sperimentale, mai verificato';

export const CLASSIFICATION_STATS_LABELS: Array<{ key: keyof import('./types').ClassificationStats; label: string; color: string }> = [
  { key: 'veg', label: 'Possibile vegetazione', color: '#3f8f4b' },
  { key: 'open', label: 'Possibile terreno aperto', color: '#c8a93c' },
  { key: 'water', label: 'Possibile acqua', color: '#3b82b8' },
  { key: 'art', label: 'Superficie artificiale', color: '#8e8e8e' },
  { key: 'unc', label: 'Zona incerta', color: '#a78bbf' },
];

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyProject(name = 'Nuovo progetto'): Project {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA_VERSION,
    id: makeId(),
    name,
    createdAt: now,
    updatedAt: now,
    image: null,
    worldFile: null,
    projectionWKT: null,
    projectionSource: 'none',
    imageBBox: null,
    calibration: null,
    printScale: DEFAULT_PRINT_SCALE,
    orientation: 'source',
    showNorth: true,
    classification: null,
    layers: structuredClone(DEFAULT_LAYERS),
    layerOrder: [...DEFAULT_LAYER_ORDER],
    features: [],
    osmWays: [],
    contours: [],
    contourInterval: DEFAULT_CONTOUR_INTERVAL,
    course: { showLines: true },
    geoWarnings: [],
  };
}

export function createFeature(
  kind: FeatureKind,
  type: string,
  coords: Feature['coords'],
  extra: Partial<Feature> = {},
): Feature {
  const spec = typeSpec(type);
  return {
    id: makeId(),
    kind,
    type,
    name: spec.defaultName,
    notes: '',
    verified: false,
    verifiedNote: '',
    history: [],
    coords: coords.map((p) => ({ ...p })),
    source: 'manual',
    ...extra,
  };
}

export function makeVerificationEvent(
  action: VerificationEvent['action'],
  note: string,
  reason: string,
): VerificationEvent {
  return { at: new Date().toISOString(), note, reason, action };
}

export function nextControlCode(features: Feature[]): string {
  const numeric = features
    .filter((f) => f.type === 'control')
    .map((f) => Number.parseInt(f.code ?? '', 10))
    .filter((n) => Number.isFinite(n));
  const max = numeric.length ? Math.max(...numeric) : 100;
  return String(max + 1);
}

export const PRINT_SCALES = [5000, 7500, 10000, 15000, 20000, 25000];
