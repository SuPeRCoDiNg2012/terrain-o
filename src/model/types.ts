export type Point = { x: number; y: number };

export type BBox = { west: number; south: number; east: number; north: number };

/** Affine world file: x = A*col + B*row + C; y = D*col + E*row + F. */
export interface WorldFile {
  A: number;
  D: number;
  B: number;
  E: number;
  C: number;
  F: number;
}

export type LayerId = 'source' | 'classification' | 'contours' | 'osm' | 'features' | 'course';

export interface LayerState {
  visible: boolean;
  opacity: number;
}

export type FeatureKind = 'area' | 'line' | 'point';

export type FeatureSource = 'manual' | 'osm' | 'vector' | 'gpx' | 'dem';

export interface VerificationEvent {
  at: string;
  note: string;
  reason: string;
  action: 'verified' | 'revoked';
}

export interface Feature {
  id: string;
  kind: FeatureKind;
  /** Key in AREA_TYPES / LINE_TYPES / POINT_TYPES. */
  type: string;
  name: string;
  notes: string;
  verified: boolean;
  verifiedNote: string;
  history: VerificationEvent[];
  /** Pixel coordinates in source-image space. */
  coords: Point[];
  /** Optional inner rings (holes) for areas, pixel coordinates. */
  holes?: Point[][];
  /** Course order for start/control/finish points. */
  order?: number;
  /** Course control code, e.g. "101" or "A". */
  code?: string;
  source?: FeatureSource;
  osmId?: number;
}

export type ProjectionSource = 'wkt' | 'assumed-wgs84' | 'degrees' | 'none';

export interface ImageMeta {
  /** IndexedDB asset id containing the source image. */
  assetId: string;
  name: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ClassificationStats {
  unc: number;
  veg: number;
  open: number;
  water: number;
  art: number;
}

export interface ClassificationParams {
  /** Legacy hue/saturation controls, kept for compatibility with saved projects. */
  grayBalance: number;
  vegetationHueMin: number;
  vegetationHueMax: number;
  vegetationSatMin: number;
  waterHueMin: number;
  waterHueMax: number;
  waterSatMin: number;
  waterValueMax: number;
  artificialSatMax: number;
  artificialValueMin: number;
  openHueMin: number;
  openHueMax: number;
  openSatMin: number;
  /** Number of 3x3 majority-filter passes. */
  smoothing: number;

  /* --- Advanced local pipeline (optional so old projects keep loading) --- */
  /** Illumination tile size in working pixels. */
  tileSize?: number;
  /** 0..1 strength of the local luminance correction. */
  localBalance?: number;
  /** SLIC compactness. */
  slicCompactness?: number;
  /** SLIC iterations. */
  slicIterations?: number;
  /** Nominal superpixel size in working pixels. */
  superpixelSize?: number;
  /** Majority-filter radius in working pixels (1 = 3x3). */
  majorityWindow?: number;
  /** Connected components smaller than this are discarded. */
  minComponentPx?: number;
  /** Fill enclosed unclassified regions. */
  fillHoles?: boolean;
  /** 0..1 weight of texture (LBP + variance) in the decision. */
  textureWeight?: number;
  /** 0..1 weight of edge density in the decision. */
  edgeWeight?: number;
  /** Working resolution cap on the longest side. */
  maxWorkSide?: number;

  /* --- Interpretable L*a*b* decision thresholds --- */
  /** Water requires b* at or below this value. */
  waterBMax?: number;
  /** Vegetation requires a* at or below this value. */
  vegAMax?: number;
  /** Open ground requires b* at or above this value. */
  openBMin?: number;
  /** Artificial surfaces require chroma at or below this value. */
  artChromaMax?: number;
}

export interface ClassificationMeta {
  /** Also the IndexedDB asset id of the overlay image. */
  assetId: string;
  method: string;
  width: number;
  height: number;
  createdAt: string;
  stats: ClassificationStats;
  params: ClassificationParams;
}

export interface CalibrationSample {
  a: Point;
  b: Point;
  meters: number;
}

export interface Calibration {
  a: Point;
  b: Point;
  meters: number;
  mPerPx: number;
  method: 'two-point' | 'least-squares';
  extraSamples?: CalibrationSample[];
}

export interface OsmWay {
  id: number;
  kind: 'highway' | 'waterway';
  highway?: string;
  waterway?: string;
  name?: string;
  coords: Point[];
}

export interface ContourLine {
  elevation: number;
  coords: Point[];
  closed: boolean;
  index: boolean;
}

export interface CourseSettings {
  showLines: boolean;
}

export interface Project {
  schema: 'terrain-o/1.0';
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  image: ImageMeta | null;
  worldFile: WorldFile | null;
  projectionWKT: string | null;
  projectionSource: ProjectionSource;
  imageBBox: BBox | null;
  calibration: Calibration | null;
  printScale: number;
  /** We never claim a verified geographic north; only the source orientation. */
  orientation: 'source';
  showNorth: boolean;
  classification: ClassificationMeta | null;
  layers: Record<LayerId, LayerState>;
  layerOrder: LayerId[];
  features: Feature[];
  osmWays: OsmWay[];
  contours: ContourLine[];
  contourInterval: number;
  course: CourseSettings;
  geoWarnings: string[];
}

export interface AssetRecord {
  id: string;
  kind: 'source' | 'classification' | 'labels';
  mimeType?: string;
  dataURL?: string;
  data?: ArrayBuffer;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  hasImage: boolean;
  featureCount: number;
}

export interface ProjectFile {
  app: 'Terrain / O';
  appVersion: string;
  exportedAt: string;
  project: Project;
  assets: Array<{
    id: string;
    kind: 'source' | 'classification' | 'labels';
    mimeType?: string;
    dataURL?: string;
    labelsBase64?: string;
    width?: number;
    height?: number;
  }>;
}

export interface OsmCacheEntry {
  key: string;
  at: string;
  ways: OsmWay[];
}
