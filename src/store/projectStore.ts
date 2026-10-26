import { create } from 'zustand';
import type {
  Calibration,
  CalibrationSample,
  ClassificationMeta,
  ClassificationParams,
  Feature,
  LayerId,
  Point,
  Project,
} from '../model/types';
import {
  AI_METHOD,
  CLASSIFICATION_METHOD,
  DEFAULT_CLASSIFICATION_PARAMS,
  MAX_UNDO,
  createEmptyProject,
  createFeature,
  makeId,
  makeVerificationEvent,
  nextControlCode,
  typeSpec,
} from '../model/constants';
import { classifySource } from '../classify/service';
import { vectorizeLabels, type VectorizeOptions } from '../vectorize/service';
import { DEFAULT_VECTORIZE_OPTIONS } from '../vectorize/types';
import { DEFAULT_AI_OPTIONS, type AiRecognitionOptions } from '../ai/recognize';
import { recognizeSource } from '../ai/service';
import { fuseSymbols } from '../ai/fuse';
import {
  DEFAULT_AUTO_OPTIONS,
  autoReportSummary,
  runAutoPipeline,
  type AutoPipelineOptions,
  type AutoPipelineReport,
  type AutoStage,
} from '../ai/autoPipeline';
import { fetchOsmWays } from '../osm/client';
import { mergeOsmWays, osmWaysToFeatures } from '../osm/convert';
import { generateContours } from '../dem/service';
import { optimizeCourseOrder, offsetLine } from '../edit/geometry';
import { rgbaToDataURL, labelsToBase64, loadImageElement } from '../render/canvas';
import {
  getAsset,
  getLastProjectId,
  getProject,
  putAsset,
  saveProject,
  setLastProjectId,
  type StorageEstimate,
} from '../persistence/db';

export type Tool =
  | 'select'
  | 'marquee'
  | 'lasso'
  | 'pan'
  | 'zoom'
  | 'eyedropper'
  | 'text'
  | 'draw-area'
  | 'draw-line'
  | 'draw-point'
  | 'calibrate';

export interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

export interface JobState {
  running: boolean;
  percent: number;
  phase: string;
  error: string | null;
  result: string | null;
}

const idleJob = (): JobState => ({ running: false, percent: 0, phase: '', error: null, result: null });

let classificationAbort: AbortController | null = null;
let aiAbort: AbortController | null = null;
let vectorAbort: AbortController | null = null;
let osmAbort: AbortController | null = null;
let demAbort: AbortController | null = null;
let autoSequence = 0;
let autoCancelled = false;
let loadedClassificationAssetId: string | null = null;
let classificationLoadSeq = 0;

export interface ProjectState {
  project: Project;
  hydrated: boolean;
  sourceImage: HTMLImageElement | null;
  classificationImage: HTMLImageElement | null;
  classificationLabels: Uint8Array | null;
  classificationConfidence: Float32Array | null;
  past: Project[];
  future: Project[];
  selection: string[];
  activeTool: Tool;
  snapEnabled: boolean;
  gridEnabled: boolean;
  gridSize: number;
  view: ViewState;
  viewport: { width: number; height: number };
  fitNonce: number;
  zoomHistory: ViewState[];
  zoomIndex: number;
  minimapVisible: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  lastSavedAt: string | null;
  storage: StorageEstimate | null;
  classificationJob: JobState;
  aiJob: JobState;
  vectorJob: JobState;
  osmJob: JobState;
  demJob: JobState;
  autoJob: JobState;
  autoReport: AutoPipelineReport | null;
  loadError: string | null;

  init: () => Promise<void>;
  loadProjectById: (id: string) => Promise<boolean>;
  adoptProject: (
    project: Project,
    sourceImage: HTMLImageElement | null,
    classificationImage?: HTMLImageElement | null,
    labels?: Uint8Array | null,
  ) => void;
  newBlankProject: () => void;
  setSaveState: (state: ProjectState['saveState'], error?: string | null) => void;
  setStorage: (storage: StorageEstimate) => void;

  setView: (view: ViewState, record?: boolean) => void;
  setViewport: (width: number, height: number) => void;
  fitImage: () => void;
  focusSelection: () => void;
  recordZoom: () => void;
  zoomBack: () => void;
  zoomForward: () => void;
  setMinimapVisible: (visible: boolean) => void;

  setTool: (tool: Tool) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGridEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  pushUndo: () => void;
  commit: (mutator: (project: Project) => void) => void;
  apply: (mutator: (project: Project) => void) => void;
  undo: () => void;
  redo: () => void;

  addFeature: (feature: Feature, options?: { select?: boolean }) => void;
  updateFeatureFields: (id: string, fields: Partial<Pick<Feature, 'name' | 'notes' | 'code' | 'type'>>) => void;
  updateFeatureGeometry: (id: string, coords: Point[], holes?: Point[][]) => void;
  updateVertexLive: (id: string, index: number, point: Point) => void;
  moveSelectionLive: (dx: number, dy: number) => void;
  nudgeSelection: (dx: number, dy: number) => void;
  addVertex: (id: string, point: Point) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  batchSetType: (type: string) => void;
  offsetSelectedLines: (distancePx: number) => void;

  verifyFeatures: (ids: string[], note: string) => void;
  revokeVerification: (ids: string[], reason: string) => void;

  addCoursePoint: (type: 'start' | 'control' | 'finish', point: Point) => void;
  addGpxWaypoints: (points: Array<{ point: Point; name?: string; code?: string }>) => number;
  moveCoursePoint: (id: string, direction: -1 | 1) => void;
  optimizeCourse: () => void;
  setCourseLinesVisible: (visible: boolean) => void;

  setLayerVisible: (id: LayerId, visible: boolean) => void;
  setLayerOpacity: (id: LayerId, opacity: number) => void;
  reorderLayer: (id: LayerId, targetIndex: number) => void;

  setName: (name: string) => void;
  setPrintScale: (scale: number) => void;
  setShowNorth: (show: boolean) => void;
  setCalibration: (samples: CalibrationSample[]) => void;
  clearCalibration: () => void;
  setContourInterval: (interval: number) => void;

  runClassification: (params: ClassificationParams) => Promise<void>;
  cancelClassification: () => void;
  runVectorization: (options: VectorizeOptions, mode: 'replace' | 'append') => Promise<number>;
  cancelVectorization: () => void;
  runAiRecognition: (options?: Partial<AiRecognitionOptions>) => Promise<number>;
  cancelAiRecognition: () => void;
  runSymbolFusion: () => number;
  runAutomaticPipeline: (options?: Partial<AutoPipelineOptions>) => Promise<AutoPipelineReport | null>;
  cancelAutomaticPipeline: () => void;
  runOsmFetch: (options?: { force?: boolean }) => Promise<void>;
  cancelOsmFetch: () => void;
  convertOsmToFeatures: () => number;
  runOsmFusion: () => Promise<{ features: number; classified: boolean }>;
  clearOsm: () => void;
  runDemContours: (interval: number) => Promise<void>;
  cancelDemContours: () => void;
  clearContours: () => void;
  clearLoadError: () => void;
}

const now = () => new Date().toISOString();

/**
 * One symbol layer: every automatic commit is reconciled immediately, so AI,
 * OSM and vector output never pile up as duplicate overlapping symbols. The
 * same routine backs the explicit “Unifica livello simboli” action.
 */
function fuseDraftSymbols(draft: Project) {
  const result = fuseSymbols(draft.features);
  draft.features = result.features;
  draft.symbolFusion = { createdAt: now(), ...result.stats };
  return result.stats;
}

function filterSelection(selection: string[], project: Project): string[] {
  const ids = new Set(project.features.map((f) => f.id));
  return selection.filter((id) => ids.has(id));
}

function reindexCourse(project: Project): void {
  const points = project.features.filter((f) => f.kind === 'point' && ['start', 'control', 'finish'].includes(f.type));
  const starts = points.filter((f) => f.type === 'start').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const controls = points.filter((f) => f.type === 'control').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const finishes = points.filter((f) => f.type === 'finish').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const ordered = [...starts.slice(0, 1), ...controls, ...finishes.slice(0, 1)];
  ordered.forEach((feature, index) => {
    feature.order = index;
  });
  points.filter((f) => !ordered.includes(f)).forEach((f) => delete f.order);
}

function copyFeatureForDuplicate(feature: Feature, project: Project): Feature {
  const offset = 20;
  const controls = project.features.filter((f) => f.type === 'control').length;
  return {
    ...structuredClone(feature),
    id: makeId(),
    verified: false,
    verifiedNote: '',
    history: [],
    coords: feature.coords.map((p) => ({ x: p.x + offset, y: p.y + offset })),
    holes: feature.holes?.map((ring) => ring.map((p) => ({ x: p.x + offset, y: p.y + offset }))),
    code: feature.type === 'control' ? String(101 + controls) : feature.code,
    order: feature.type === 'control' ? 9999 : feature.order,
  };
}

function applyGeometryChange(feature: Feature, reason: string): void {
  if (feature.verified) {
    feature.history.push(makeVerificationEvent('revoked', feature.verifiedNote, reason));
    feature.verified = false;
    feature.verifiedNote = '';
  }
}

function sameCoords(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-9 && Math.abs(p.y - b[i].y) < 1e-9);
}

function coordsChanged(feature: Feature, coords: Point[], holes?: Point[][]): boolean {
  if (!sameCoords(feature.coords, coords)) return true;
  if (holes === undefined) return false;
  const oldHoles = feature.holes ?? [];
  if (oldHoles.length !== holes.length) return true;
  return holes.some((ring, i) => !sameCoords(ring, oldHoles[i]));
}

const initialState = {
  project: createEmptyProject(),
  hydrated: false,
  sourceImage: null as HTMLImageElement | null,
  classificationImage: null as HTMLImageElement | null,
  classificationLabels: null as Uint8Array | null,
  classificationConfidence: null as Float32Array | null,
  past: [] as Project[],
  future: [] as Project[],
  selection: [] as string[],
  activeTool: 'select' as Tool,
  snapEnabled: true,
  gridEnabled: false,
  gridSize: 10,
  view: { scale: 1, tx: 0, ty: 0 },
  viewport: { width: 1000, height: 700 },
  fitNonce: 0,
  zoomHistory: [] as ViewState[],
  zoomIndex: -1,
  minimapVisible: true,
  saveState: 'idle' as const,
  saveError: null as string | null,
  lastSavedAt: null as string | null,
  storage: null as StorageEstimate | null,
  classificationJob: idleJob(),
  aiJob: idleJob(),
  vectorJob: idleJob(),
  osmJob: idleJob(),
  demJob: idleJob(),
  autoJob: idleJob(),
  autoReport: null as AutoPipelineReport | null,
  loadError: null as string | null,
};

function decodeLabelAsset(raw: Uint8Array | null, expected: number | null): {
  labels: Uint8Array | null;
  confidence: Float32Array | null;
} {
  if (!raw) return { labels: null, confidence: null };
  if (expected && expected > 0 && raw.length >= expected * 2) {
    const labels = raw.subarray(0, expected);
    const confidence = new Float32Array(expected);
    for (let index = 0; index < expected; index++) confidence[index] = raw[expected + index] / 255;
    return { labels, confidence };
  }
  return { labels: raw, confidence: null };
}

async function hydrateClassification(project: Project): Promise<{
  image: HTMLImageElement | null;
  labels: Uint8Array | null;
  confidence: Float32Array | null;
}> {
  const meta = project.classification;
  if (!meta) return { image: null, labels: null, confidence: null };
  const [imageAsset, labelsAsset] = await Promise.all([
    getAsset(meta.assetId),
    getAsset(`${meta.assetId}:labels`),
  ]);
  const image = imageAsset?.dataURL ? await loadImageElement(imageAsset.dataURL).catch(() => null) : null;
  const decoded = decodeLabelAsset(labelsAsset?.data ? new Uint8Array(labelsAsset.data) : null, meta.width * meta.height);
  return { image, labels: decoded.labels, confidence: decoded.confidence };
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  const syncClassificationAssets = async () => {
    const seq = ++classificationLoadSeq;
    const project = get().project;
    const assetId = project.classification?.assetId ?? null;
    if (!assetId) {
      loadedClassificationAssetId = null;
      set({ classificationImage: null, classificationLabels: null, classificationConfidence: null });
      return;
    }
    if (loadedClassificationAssetId === assetId) return;
    try {
      const hydrated = await hydrateClassification(project);
      if (seq !== classificationLoadSeq) return;
      loadedClassificationAssetId = assetId;
      set({ classificationImage: hydrated.image, classificationLabels: hydrated.labels, classificationConfidence: hydrated.confidence });
    } catch {
      if (seq === classificationLoadSeq) set({ classificationImage: null, classificationLabels: null, classificationConfidence: null });
    }
  };

  return {
    ...initialState,

    init: async () => {
      try {
        const lastId = getLastProjectId();
        const project = lastId ? await getProject(lastId) : undefined;
        if (!project) {
          set({ hydrated: true });
          return;
        }
        const sourceAsset = project.image ? await getAsset(project.image.assetId) : undefined;
        const sourceImage = sourceAsset?.dataURL ? await loadImageElement(sourceAsset.dataURL) : null;
        const classified = await hydrateClassification(project);
        loadedClassificationAssetId = project.classification?.assetId ?? null;
        set({
          project,
          sourceImage,
          classificationImage: classified.image,
          classificationLabels: classified.labels,
          classificationConfidence: classified.confidence,
          past: [],
          future: [],
          selection: [],
          fitNonce: sourceImage ? 1 : 0,
          hydrated: true,
        });
      } catch (error) {
        set({
          hydrated: true,
          loadError:
            error instanceof Error
              ? `Impossibile recuperare la sessione precedente: ${error.message}`
              : 'Impossibile recuperare la sessione precedente.',
        });
      }
    },

    loadProjectById: async (id) => {
      try {
        const project = await getProject(id);
        if (!project) return false;
        const sourceAsset = project.image ? await getAsset(project.image.assetId) : undefined;
        const sourceImage = sourceAsset?.dataURL ? await loadImageElement(sourceAsset.dataURL) : null;
        const classified = await hydrateClassification(project);
        loadedClassificationAssetId = project.classification?.assetId ?? null;
        setLastProjectId(project.id);
        set({
          project,
          sourceImage,
          classificationImage: classified.image,
          classificationLabels: classified.labels,
          classificationConfidence: classified.confidence,
          past: [],
          future: [],
          selection: [],
          fitNonce: sourceImage ? get().fitNonce + 1 : get().fitNonce,
          saveState: 'saved',
          saveError: null,
        });
        return true;
      } catch (error) {
        set({ loadError: error instanceof Error ? error.message : 'Impossibile aprire il progetto.' });
        return false;
      }
    },

    adoptProject: (project, sourceImage, classificationImage = null, labels = null) => {
      loadedClassificationAssetId = project.classification?.assetId ?? null;
      autoCancelled = true;
      autoSequence++;
      const decoded = decodeLabelAsset(labels, project.classification ? project.classification.width * project.classification.height : null);
      set({
        project,
        autoJob: idleJob(),
        autoReport: null,
        sourceImage,
        classificationImage,
        classificationLabels: decoded.labels,
        classificationConfidence: decoded.confidence,
        past: [],
        future: [],
        selection: [],
        activeTool: 'select',
        fitNonce: sourceImage ? get().fitNonce + 1 : get().fitNonce,
        saveState: 'idle',
        saveError: null,
      });
    },

    newBlankProject: () => {
      loadedClassificationAssetId = null;
      classificationLoadSeq++;
      autoCancelled = true;
      autoSequence++;
      setLastProjectId(null);
      set({
        ...initialState,
        hydrated: true,
        project: createEmptyProject(),
        fitNonce: 0,
      });
    },

    setSaveState: (saveState, error = null) =>
      set({ saveState, saveError: error, lastSavedAt: saveState === 'saved' ? now() : get().lastSavedAt }),

    setStorage: (storage) => set({ storage }),

    setView: (view, record = false) => {
      set({ view });
      if (record) {
        setTimeout(() => {
          const state = get();
          const last = state.zoomHistory[state.zoomIndex];
          if (last && Math.abs(last.scale - view.scale) < 1e-4 && Math.abs(last.tx - view.tx) < 0.5 && Math.abs(last.ty - view.ty) < 0.5) return;
          const history = state.zoomHistory.slice(0, state.zoomIndex + 1);
          history.push(view);
          set({ zoomHistory: history.slice(-20), zoomIndex: Math.min(history.length, 20) - 1 });
        }, 250);
      }
    },

    setViewport: (width, height) => {
      if (width <= 0 || height <= 0) return;
      set({ viewport: { width, height } });
    },

    fitImage: () => {
      const { project, viewport } = get();
      if (!project.image) {
        set({ view: { scale: 1, tx: 0, ty: 0 } });
        return;
      }
      const scale = Math.min(viewport.width / project.image.width, viewport.height / project.image.height) * 0.92;
      const view = {
        scale,
        tx: (viewport.width - project.image.width * scale) / 2,
        ty: (viewport.height - project.image.height * scale) / 2,
      };
      get().setView(view, true);
    },

    focusSelection: () => {
      const { project, selection, viewport } = get();
      const selected = project.features.filter((f) => selection.includes(f.id));
      if (!selected.length) return;
      const points = selected.flatMap((f) => [...f.coords, ...(f.holes ?? []).flat()]);
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));
      const width = Math.max(40, maxX - minX);
      const height = Math.max(40, maxY - minY);
      const scale = Math.min(viewport.width / width, viewport.height / height) * 0.55;
      const view = {
        scale: Math.min(32, Math.max(0.02, scale)),
        tx: viewport.width / 2 - ((minX + maxX) / 2) * Math.min(32, Math.max(0.02, scale)),
        ty: viewport.height / 2 - ((minY + maxY) / 2) * Math.min(32, Math.max(0.02, scale)),
      };
      get().setView(view, true);
    },

    recordZoom: () => get().setView(get().view, true),

    zoomBack: () => {
      const { zoomIndex, zoomHistory } = get();
      if (zoomIndex <= 0) return;
      const index = zoomIndex - 1;
      set({ zoomIndex: index, view: zoomHistory[index] });
    },

    zoomForward: () => {
      const { zoomIndex, zoomHistory } = get();
      if (zoomIndex >= zoomHistory.length - 1) return;
      const index = zoomIndex + 1;
      set({ zoomIndex: index, view: zoomHistory[index] });
    },

    setMinimapVisible: (minimapVisible) => set({ minimapVisible }),

    setTool: (activeTool) => set({ activeTool, selection: activeTool === 'select' ? get().selection : [] }),
    setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
    setGridEnabled: (gridEnabled) => set({ gridEnabled }),
    setGridSize: (gridSize) => {
      if (!Number.isFinite(gridSize)) return;
      set({ gridSize: Math.max(1, Math.min(500, Math.round(gridSize))) });
    },
    select: (selection) => set({ selection: filterSelection(selection, get().project) }),
    toggleSelect: (id) => {
      const selection = get().selection;
      set({
        selection: selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id],
      });
    },
    clearSelection: () => set({ selection: [] }),

    pushUndo: () =>
      set((state) => ({
        past: [...state.past, structuredClone(state.project)].slice(-MAX_UNDO),
        future: [],
      })),

    commit: (mutator) => {
      get().pushUndo();
      get().apply(mutator);
    },

    apply: (mutator) => {
      const draft = structuredClone(get().project);
      mutator(draft);
      draft.updatedAt = now();
      reindexCourse(draft);
      set({ project: draft, selection: filterSelection(get().selection, draft) });
    },

    undo: () => {
      const { past, project, future } = get();
      if (!past.length) return;
      const previous = past[past.length - 1];
      set({
        project: previous,
        past: past.slice(0, -1),
        future: [structuredClone(project), ...future].slice(0, MAX_UNDO),
        selection: filterSelection(get().selection, previous),
      });
      void syncClassificationAssets();
    },

    redo: () => {
      const { future, project, past } = get();
      if (!future.length) return;
      const next = future[0];
      set({
        project: next,
        past: [...past, structuredClone(project)].slice(-MAX_UNDO),
        future: future.slice(1),
        selection: filterSelection(get().selection, next),
      });
      void syncClassificationAssets();
    },

    addFeature: (feature, options = {}) => {
      get().commit((draft) => {
        draft.features.push(feature);
      });
      if (options.select !== false) set({ selection: [feature.id] });
    },

    updateFeatureFields: (id, fields) => {
      const project = get().project;
      if (fields.type) {
        if (fields.type === 'start' || fields.type === 'finish') {
          const clash = project.features.find((f) => f.id !== id && f.type === fields.type);
          if (clash) {
            set({ loadError: `Esiste già un elemento di tipo ${typeSpec(fields.type).label}.` });
            return;
          }
        }
      }
      get().commit((draft) => {
        const feature = draft.features.find((f) => f.id === id);
        if (!feature) return;
        if (fields.type && typeSpec(fields.type).kind !== feature.kind) return;
        Object.assign(feature, fields);
        if (fields.type && !fields.name) feature.name = typeSpec(fields.type).defaultName;
        reindexCourse(draft);
      });
    },

    updateFeatureGeometry: (id, coords, holes) => {
      const feature = get().project.features.find((f) => f.id === id);
      if (!feature || !coordsChanged(feature, coords, holes)) return;
      get().commit((draft) => {
        const target = draft.features.find((f) => f.id === id);
        if (!target) return;
        applyGeometryChange(target, 'Modifica geometrica');
        target.coords = coords.map((p) => ({ ...p }));
        if (holes !== undefined) target.holes = holes.map((ring) => ring.map((p) => ({ ...p })));
      });
    },

    updateVertexLive: (id, index, point) => {
      get().apply((draft) => {
        const feature = draft.features.find((f) => f.id === id);
        if (!feature || !feature.coords[index]) return;
        applyGeometryChange(feature, 'Modifica geometrica');
        feature.coords[index] = { ...point };
      });
    },

    moveSelectionLive: (dx, dy) => {
      if (!dx && !dy) return;
      const selection = new Set(get().selection);
      get().apply((draft) => {
        for (const feature of draft.features) {
          if (!selection.has(feature.id)) continue;
          applyGeometryChange(feature, 'Modifica geometrica');
          feature.coords = feature.coords.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          feature.holes = feature.holes?.map((ring) => ring.map((p) => ({ x: p.x + dx, y: p.y + dy })));
        }
      });
    },

    nudgeSelection: (dx, dy) => {
      if (!get().selection.length || (!dx && !dy)) return;
      get().pushUndo();
      get().moveSelectionLive(dx, dy);
    },

    addVertex: (id, point) => {
      get().commit((draft) => {
        const feature = draft.features.find((f) => f.id === id);
        if (!feature || feature.kind === 'point') return;
        applyGeometryChange(feature, 'Modifica geometrica');
        let best = feature.coords.length;
        let bestDistance = Infinity;
        for (let i = 1; i < feature.coords.length; i++) {
          const a = feature.coords[i - 1];
          const b = feature.coords[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
          const distance = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        }
        feature.coords.splice(best, 0, { ...point });
      });
    },

    deleteSelected: () => {
      const selection = new Set(get().selection);
      if (!selection.size) return;
      get().commit((draft) => {
        draft.features = draft.features.filter((f) => !selection.has(f.id));
        reindexCourse(draft);
      });
      set({ selection: [] });
    },

    duplicateSelected: () => {
      const selected = get().project.features.filter((f) => get().selection.includes(f.id));
      if (!selected.length) return;
      const additions: Feature[] = [];
      get().commit((draft) => {
        for (const feature of selected) {
          if (feature.type === 'start' || feature.type === 'finish') continue;
          const copy = copyFeatureForDuplicate(feature, draft);
          draft.features.push(copy);
          additions.push(copy);
        }
        reindexCourse(draft);
      });
      if (additions.length) set({ selection: additions.map((f) => f.id) });
    },

    batchSetType: (type) => {
      const spec = typeSpec(type);
      const selected = new Set(get().selection);
      if (!selected.size) return;
      get().commit((draft) => {
        for (const feature of draft.features) {
          if (!selected.has(feature.id) || feature.kind !== spec.kind) continue;
          feature.type = type;
          feature.name = spec.defaultName;
        }
        reindexCourse(draft);
      });
    },

    offsetSelectedLines: (distancePx) => {
      const selected = new Set(get().selection);
      if (!selected.size || !distancePx) return;
      get().commit((draft) => {
        for (const feature of draft.features) {
          if (!selected.has(feature.id) || feature.kind !== 'line') continue;
          applyGeometryChange(feature, 'Modifica geometrica');
          feature.coords = offsetLine(feature.coords, distancePx);
        }
      });
    },

    verifyFeatures: (ids, note) => {
      const valid = new Set(ids);
      if (!valid.size) return;
      get().commit((draft) => {
        draft.features.forEach((feature) => {
          if (!valid.has(feature.id) || feature.verified) return;
          feature.verified = true;
          feature.verifiedNote = note;
          feature.history.push(
            makeVerificationEvent('verified', note, "Dichiarazione esplicita dell'utente"),
          );
        });
      });
    },

    revokeVerification: (ids, reason) => {
      const valid = new Set(ids);
      get().commit((draft) => {
        draft.features.forEach((feature) => {
          if (!valid.has(feature.id) || !feature.verified) return;
          feature.history.push(makeVerificationEvent('revoked', feature.verifiedNote, reason));
          feature.verified = false;
          feature.verifiedNote = '';
        });
      });
    },

    addCoursePoint: (type, point) => {
      if (type !== 'control') {
        const existing = get().project.features.find((f) => f.type === type);
        if (existing) {
          set({ selection: [existing.id] });
          return;
        }
      }
      const project = get().project;
      const code = type === 'control' ? nextControlCode(project.features) : undefined;
      const feature = createFeature('point', type, [point], {
        code,
        name: typeSpec(type).defaultName,
        order: type === 'start' ? -1 : type === 'finish' ? 9999 : undefined,
      });
      get().commit((draft) => {
        if (type === 'control') {
          const maxOrder = Math.max(
            0,
            ...draft.features
              .filter((f) => f.type === 'control' || f.type === 'start')
              .map((f) => f.order ?? 0),
          );
          feature.order = maxOrder + 1;
        }
        draft.features.push(feature);
      });
      set({ selection: [feature.id], activeTool: 'select' });
    },

    addGpxWaypoints: (points) => {
      if (!points.length) return 0;
      const additions: Feature[] = [];
      get().commit((draft) => {
        let code = Number.parseInt(nextControlCode(draft.features), 10);
        const maxOrder = Math.max(
          0,
          ...draft.features
            .filter((f) => f.type === 'control' || f.type === 'start')
            .map((f) => f.order ?? 0),
        );
        points.forEach((entry, index) => {
          const numericCode = entry.code && /^\d+$/.test(entry.code) ? Number(entry.code) : code;
          if (Number.isFinite(numericCode)) code = Math.max(code, numericCode) + 1;
          const feature = createFeature('point', 'control', [entry.point], {
            name: entry.name?.trim() || 'Controllo GPX',
            code: entry.code || String(numericCode),
            order: maxOrder + 1 + index,
            source: 'gpx',
          });
          draft.features.push(feature);
          additions.push(feature);
        });
      });
      set({ selection: additions.map((f) => f.id) });
      return additions.length;
    },

    moveCoursePoint: (id, direction) => {
      get().commit((draft) => {
        const controls = draft.features
          .filter((f) => f.type === 'control')
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const index = controls.findIndex((f) => f.id === id);
        if (index < 0) return;
        const target = index + direction;
        if (target < 0 || target >= controls.length) return;
        const a = controls[index];
        const b = controls[target];
        const aOrder = a.order;
        a.order = b.order;
        b.order = aOrder;
      });
    },

    optimizeCourse: () => {
      get().commit((draft) => {
        const orders = optimizeCourseOrder(draft);
        if (!orders.size) return;
        for (const feature of draft.features) {
          const order = orders.get(feature.id);
          if (order != null) feature.order = order;
        }
        reindexCourse(draft);
      });
    },

    setCourseLinesVisible: (visible) =>
      get().apply((draft) => {
        draft.course.showLines = visible;
      }),

    setLayerVisible: (id, visible) =>
      get().apply((draft) => {
        draft.layers[id].visible = visible;
      }),

    setLayerOpacity: (id, opacity) =>
      get().apply((draft) => {
        draft.layers[id].opacity = Math.max(0, Math.min(1, opacity));
      }),

    reorderLayer: (id, targetIndex) =>
      get().apply((draft) => {
        const order = draft.layerOrder.filter((layer) => layer !== id);
        const clamped = Math.max(0, Math.min(order.length, targetIndex));
        order.splice(clamped, 0, id);
        draft.layerOrder = order;
      }),

    setName: (name) =>
      get().apply((draft) => {
        draft.name = name.slice(0, 120) || 'Senza nome';
      }),

    setPrintScale: (scale) =>
      get().apply((draft) => {
        draft.printScale = Math.max(1000, Math.min(50000, Math.round(scale)));
      }),

    setShowNorth: (show) =>
      get().apply((draft) => {
        draft.showNorth = show;
      }),

    setCalibration: (samples) => {
      const valid = samples.filter((s) => s.meters > 0);
      if (!valid.length) return;
      let numerator = 0;
      let denominator = 0;
      for (const sample of valid) {
        const pixelDistance = Math.hypot(sample.b.x - sample.a.x, sample.b.y - sample.a.y);
        if (pixelDistance < 1) continue;
        numerator += pixelDistance * sample.meters;
        denominator += pixelDistance * pixelDistance;
      }
      if (denominator <= 0) {
        set({ loadError: 'I punti di calibrazione sono troppo vicini: scegliere due punti distanti.' });
        return;
      }
      const first = valid[0];
      const calibration: Calibration = {
        a: first.a,
        b: first.b,
        meters: first.meters,
        mPerPx: numerator / denominator,
        method: valid.length > 1 ? 'least-squares' : 'two-point',
        ...(valid.length > 1 ? { extraSamples: valid.slice(1) } : {}),
      };
      get().commit((draft) => {
        draft.calibration = calibration;
      });
    },

    clearCalibration: () =>
      get().commit((draft) => {
        draft.calibration = null;
      }),

    setContourInterval: (interval) =>
      get().apply((draft) => {
        draft.contourInterval = Math.max(1, Math.min(100, Math.round(interval)));
      }),

    runClassification: async (params) => {
      const { sourceImage, project } = get();
      if (!sourceImage || !project.image) {
        set({ classificationJob: { ...idleJob(), error: 'Importare prima un\'immagine sorgente.' } });
        return;
      }
      if (get().classificationJob.running) return;
      classificationAbort?.abort();
      const controller = new AbortController();
      classificationAbort = controller;
      set({
        classificationJob: { running: true, percent: 0, phase: 'Avvio classificazione', error: null, result: null },
      });
      try {
        const output = await classifySource(
          sourceImage,
          project.image.width,
          project.image.height,
          params,
          {
            signal: controller.signal,
            onProgress: (info) =>
              set({ classificationJob: { ...get().classificationJob, percent: info.percent, phase: info.phase } }),
          },
          // OSM is used as a prior when present and enabled; the classifier still
          // owns the decision and the output remains experimental.
          project.osmWays,
        );
        if (controller.signal.aborted) return;
        const dataURL = rgbaToDataURL(output.overlay, output.width, output.height);
        const assetId = makeId();
        await putAsset({
          id: assetId,
          kind: 'classification',
          mimeType: dataURL.startsWith('data:image/webp') ? 'image/webp' : 'image/png',
          dataURL,
          width: output.width,
          height: output.height,
          createdAt: now(),
        });
        const labelsCopy = output.labels.slice();
        const confidenceCopy = output.confidence.slice();
        const packed = new Uint8Array(labelsCopy.length + confidenceCopy.length);
        packed.set(labelsCopy, 0);
        for (let index = 0; index < confidenceCopy.length; index++) {
          packed[labelsCopy.length + index] = Math.round(Math.max(0, Math.min(1, confidenceCopy[index])) * 255);
        }
        await putAsset({
          id: `${assetId}:labels`,
          kind: 'labels',
          data: packed.buffer,
          width: output.width,
          height: output.height,
          createdAt: now(),
        });
        const image = await loadImageElement(dataURL);
        const meta: ClassificationMeta = {
          assetId,
          method: CLASSIFICATION_METHOD,
          width: output.width,
          height: output.height,
          createdAt: now(),
          stats: output.stats,
          params: { ...params },
          ...(output.osmAgreement ? { osmAgreement: output.osmAgreement } : {}),
          ...(output.osmContrasts?.length ? { osmContrasts: output.osmContrasts } : {}),
        };
        if (get().sourceImage !== sourceImage) {
          set({ classificationJob: { ...idleJob(), error: 'Immagine cambiata durante la classificazione: risultato scartato.' } });
          return;
        }
        loadedClassificationAssetId = assetId;
        set({ classificationImage: image, classificationLabels: labelsCopy, classificationConfidence: confidenceCopy });
        get().commit((draft) => {
          draft.classification = meta;
          draft.layers.classification.visible = true;
        });
        set({
          classificationJob: {
            running: false,
            percent: 100,
            phase: 'Classificazione completata',
            error: null,
            result: `Immagine ${output.width}×${output.height} · metodo ${CLASSIFICATION_METHOD}`,
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          set({ classificationJob: { ...idleJob(), phase: 'Classificazione annullata' } });
          return;
        }
        set({
          classificationJob: {
            ...idleJob(),
            error: error instanceof Error ? error.message : 'Errore durante la classificazione.',
          },
        });
      } finally {
        if (classificationAbort === controller) classificationAbort = null;
      }
    },

    cancelClassification: () => {
      classificationAbort?.abort();
    },

    runVectorization: async (options, mode) => {
      const { classificationLabels, classificationConfidence, project, vectorJob } = get();
      if (vectorJob.running) return 0;
      if (!classificationLabels || !project.classification) {
        set({ vectorJob: { ...idleJob(), error: 'Eseguire prima una classificazione.' } });
        return 0;
      }
      const controller = new AbortController();
      vectorAbort = controller;
      set({ vectorJob: { running: true, percent: 0, phase: 'Avvio vettorizzazione', error: null, result: null } });
      try {
        const regions = await vectorizeLabels(
          classificationLabels,
          project.classification.width,
          project.classification.height,
          options,
          {
            signal: controller.signal,
            onProgress: (percent, phase) =>
              set({ vectorJob: { ...get().vectorJob, percent, phase } }),
          },
          classificationConfidence,
        );
        if (controller.signal.aborted) return 0;
        const scaleX = project.image ? project.image.width / project.classification.width : 1;
        const scaleY = project.image ? project.image.height / project.classification.height : 1;
        const features = regions.map((region) =>
          createFeature(
            'area',
            region.featureType,
            region.coords.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
            {
              holes: region.holes.map((hole) => hole.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }))),
              source: 'vector',
              name: `${typeSpec(region.featureType).label} (automatico)`,
              notes: 'Estratto dalla classificazione sperimentale: non verificato.',
            },
          ),
        );
        let fusionRemoved = 0;
        get().commit((draft) => {
          if (mode === 'replace') {
            draft.features = draft.features.filter((f) => f.source !== 'vector');
          }
          draft.features.push(...features);
          fusionRemoved = fuseDraftSymbols(draft).removed;
        });
        const fusionNote = fusionRemoved ? ` · ${fusionRemoved} duplicati uniti` : '';
        set({
          vectorJob: {
            running: false,
            percent: 100,
            phase: 'Vettorizzazione completata',
            error: null,
            result: `${features.length} aree generate (${mode === 'replace' ? 'sostituite' : 'aggiunte'})${fusionNote}`,
          },
        });
        return features.length;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          set({ vectorJob: { ...idleJob(), phase: 'Vettorizzazione annullata' } });
          return 0;
        }
        set({
          vectorJob: {
            ...idleJob(),
            error: error instanceof Error ? error.message : 'Errore durante la vettorizzazione.',
          },
        });
        return 0;
      } finally {
        if (vectorAbort === controller) vectorAbort = null;
      }
    },

    cancelVectorization: () => vectorAbort?.abort(),

    runAiRecognition: async (options = {}) => {
      const { sourceImage, project, aiJob } = get();
      if (!sourceImage || !project.image) {
        set({ aiJob: { ...idleJob(), error: 'Importare prima un’immagine sorgente.' } });
        return 0;
      }
      if (aiJob.running) return 0;
      aiAbort?.abort();
      const controller = new AbortController();
      aiAbort = controller;
      const settings = { ...DEFAULT_AI_OPTIONS, ...options };
      set({ aiJob: { ...idleJob(), running: true, phase: 'Avvio riconoscimento' } });
      try {
        const params = project.classification?.params ?? DEFAULT_CLASSIFICATION_PARAMS;
        const output = await recognizeSource(sourceImage, project, params, settings, {
          signal: controller.signal,
          onProgress: (info) =>
            set({ aiJob: { ...get().aiJob, percent: Math.round(info.percent * 0.9), phase: info.phase } }),
        });
        if (controller.signal.aborted) return 0;

        set({ aiJob: { ...get().aiJob, percent: 91, phase: 'Vettorizzazione simboli' } });
        const vectorOptions: VectorizeOptions = {
          simplifyTolerance: 1.4,
          smoothIterations: 2,
          minAreaPx: 28,
          minHoleAreaPx: 10,
          confidenceThreshold: 0.38,
          hierarchyPriority: true,
          reconcileEdges: true,
          categories: [1, 2, 3, 4, 5],
          fillHoles: true,
        };
        const regions = await vectorizeLabels(
          output.labels,
          output.width,
          output.height,
          vectorOptions,
          {
            signal: controller.signal,
            onProgress: (percent, phase) =>
              set({
                aiJob: {
                  ...get().aiJob,
                  percent: 91 + Math.round(percent * 0.07),
                  phase: `Vettorizzazione · ${phase}`,
                },
              }),
          },
          output.confidence,
        );
        if (controller.signal.aborted) return 0;
        if (get().project.id !== project.id || get().project.image?.assetId !== project.image.assetId) {
          set({ aiJob: { ...idleJob(), error: 'Progetto o immagine cambiati durante il riconoscimento: risultato scartato.' } });
          return 0;
        }

        const image = project.image;
        const scaleX = image.width / output.width;
        const scaleY = image.height / output.height;
        const regionFeatures = regions.map((region) =>
          createFeature(
            'area',
            region.featureType,
            region.coords.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
            {
              holes: region.holes.map((hole) =>
                hole.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
              ),
              source: 'ml',
              name: `${typeSpec(region.featureType).label} (AI)`,
              notes: 'Riconosciuto da un modello locale addestrato sui dati del progetto: interpretazione automatica non verificata.',
              mlConfidence: region.confidence,
            },
          ),
        );
        const treeFeatures = output.trees.map((tree) =>
          createFeature('point', 'tree', [{ x: tree.x * scaleX, y: tree.y * scaleY }], {
            source: 'ml',
            name: 'Albero isolato (AI)',
            notes: 'Rilevato sulla chioma nell’ortofoto: punto automatico non verificato.',
            mlConfidence: tree.confidence,
          }),
        );
        if (!regionFeatures.length && !treeFeatures.length) {
          throw new Error('Nessun simbolo riconosciuto con i parametri correnti. Aggiungi esempi o abbassa la soglia.');
        }

        const buildings = regionFeatures.filter((feature) => feature.type === 'building').length;
        let fusionRemoved = 0;
        get().commit((draft) => {
          draft.features = draft.features.filter((feature) => feature.source !== 'ml');
          draft.features.push(...regionFeatures, ...treeFeatures);
          draft.ai = {
            createdAt: now(),
            samples: output.stats.samples,
            labelledSamples: output.stats.labelledSamples,
            validation: output.stats.validation,
            classes: output.stats.classes,
            polygons: regionFeatures.length,
            buildings,
            trees: treeFeatures.length,
            method: AI_METHOD,
            featureImportance: output.stats.featureImportance,
          };
          // Automatic fusion: the recognition produces one reconciled symbol
          // layer instead of leaving AI duplicates over OSM or manual geometry.
          fusionRemoved = fuseDraftSymbols(draft).removed;
          draft.layers.features.visible = true;
        });
        const keptAi = get().project.features.filter((feature) => feature.source === 'ml').length;
        const fusionNote = fusionRemoved
          ? ` · ${fusionRemoved} duplicati uniti in un unico livello`
          : '';
        set({
          aiJob: {
            running: false,
            percent: 100,
            phase: 'Riconoscimento completato',
            error: null,
            result: `${regionFeatures.length} aree · ${buildings} edifici · ${treeFeatures.length} alberi · ${output.stats.samples} campioni · validazione ${output.stats.validation.toFixed(1)}%${fusionNote}`,
          },
        });
        return keptAi;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          set({ aiJob: { ...idleJob(), phase: 'Riconoscimento annullato' } });
          return 0;
        }
        set({
          aiJob: {
            ...idleJob(),
            error: error instanceof Error ? error.message : 'Errore durante il riconoscimento AI.',
          },
        });
        return 0;
      } finally {
        if (aiAbort === controller) aiAbort = null;
      }
    },

    cancelAiRecognition: () => aiAbort?.abort(),

    runSymbolFusion: () => {
      const project = get().project;
      if (!project.features.length) {
        set({ aiJob: { ...idleJob(), error: 'Nessun elemento da unificare.' } });
        return 0;
      }
      let stats: ReturnType<typeof fuseDraftSymbols> | null = null;
      get().commit((draft) => {
        stats = fuseDraftSymbols(draft);
      });
      const resolved = stats ?? fuseSymbols(project.features).stats;
      const conflictNote = resolved.protectedConflicts
        ? ` · ${resolved.protectedConflicts} conflitti protetti lasciati intatti`
        : '';
      set({
        aiJob: {
          ...get().aiJob,
          error: null,
          result: resolved.removed
            ? `Livello simboli unificato: ${resolved.removed} duplicati rimossi, ${resolved.after} elementi${conflictNote}.`
            : `Nessun duplicato automatico: ${resolved.after} elementi già unici${conflictNote}.`,
        },
      });
      return resolved.removed;
    },

    runAutomaticPipeline: async (partialOptions = {}) => {
      const settings: AutoPipelineOptions = { ...DEFAULT_AUTO_OPTIONS, ...partialOptions };
      const { sourceImage, project } = get();
      if (!sourceImage || !project.image) {
        set({ autoJob: { ...idleJob(), error: 'Importare prima un’immagine sorgente.' } });
        return null;
      }
      if (get().autoJob.running) return null;
      const busy = [
        get().classificationJob,
        get().vectorJob,
        get().aiJob,
        get().osmJob,
        get().demJob,
      ].some((job) => job.running);
      if (busy) {
        set({ autoJob: { ...idleJob(), error: 'Attendere la fine dell’elaborazione in corso.' } });
        return null;
      }

      const startProjectId = project.id;
      const startAssetId = project.image.assetId;
      const runId = ++autoSequence;
      autoCancelled = false;
      const cancelled = () =>
        autoCancelled ||
        runId !== autoSequence ||
        get().project.id !== startProjectId ||
        get().project.image?.assetId !== startAssetId;
      const report: AutoPipelineReport = {
        osmWays: 0,
        osmFeatures: 0,
        classified: false,
        classificationSize: null,
        polygons: 0,
        aiFeatures: 0,
        buildings: 0,
        trees: 0,
        contours: 0,
        fusedRemoved: 0,
        totalFeatures: project.features.length,
        warnings: [],
        durationMs: 0,
      };
      const progress = (percent: number, phase: string) => {
        if (cancelled()) return;
        set({
          autoJob: {
            ...get().autoJob,
            running: true,
            percent: Math.max(0, Math.min(100, Math.round(percent))),
            phase,
          },
        });
      };
      set({
        autoJob: { ...idleJob(), running: true, percent: 1, phase: 'Preparazione' },
        autoReport: null,
      });

      const stages: AutoStage[] = [
        {
          id: 'osm',
          label: 'OpenStreetMap',
          weight: 2,
          skip: () => {
            if (!settings.fetchOsm) return 'download OSM disattivato';
            if (!get().project.imageBBox || !get().project.worldFile) return 'immagine non georeferenziata';
            return null;
          },
          run: async () => {
            await get().runOsmFetch();
            if (cancelled()) return { ok: false };
            report.osmWays = get().project.osmWays.length;
            const job = get().osmJob;
            if (job.error) return { ok: false, warning: `OSM: ${job.error}` };
            return {
              ok: true,
              count: report.osmWays,
              warning: report.osmWays === 0 ? 'OSM: nessun elemento nel bbox' : undefined,
            };
          },
        },
        {
          id: 'osm-features',
          label: 'Elementi OSM',
          weight: 1,
          skip: () => (get().project.osmWays.length ? null : 'nessun dato OSM'),
          run: async () => {
            const added = get().convertOsmToFeatures();
            if (cancelled()) return { ok: false };
            report.osmFeatures = get().project.features.filter((feature) => feature.source === 'osm').length;
            return { ok: true, count: added };
          },
        },
        {
          id: 'classification',
          label: 'Classificazione',
          weight: 4,
          run: async () => {
            const base = get().project.classification?.params ?? DEFAULT_CLASSIFICATION_PARAMS;
            await get().runClassification({ ...base, osmPriorEnabled: get().project.osmWays.length > 0 });
            if (cancelled()) return { ok: false };
            const job = get().classificationJob;
            if (job.error) return { ok: false, warning: `Classificazione: ${job.error}` };
            const classification = get().project.classification;
            if (!classification) return { ok: false, warning: 'Classificazione: nessun risultato' };
            report.classified = true;
            report.classificationSize = `${classification.width}×${classification.height}`;
            return { ok: true };
          },
        },
        {
          id: 'vectorize',
          label: 'Vettorizzazione',
          weight: 3,
          skip: () => {
            if (!settings.vectorize) return 'vettorizzazione disattivata';
            return get().project.classification ? null : 'classificazione assente';
          },
          run: async () => {
            const count = await get().runVectorization(
              { ...DEFAULT_VECTORIZE_OPTIONS, hierarchyPriority: true, reconcileEdges: true },
              'replace',
            );
            if (cancelled()) return { ok: false };
            report.polygons = count;
            const job = get().vectorJob;
            if (job.error) return { ok: false, warning: `Vettorizzazione: ${job.error}` };
            return { ok: true, count, warning: count ? undefined : 'Vettorizzazione: nessuna area generata' };
          },
        },
        {
          id: 'ai',
          label: 'Riconoscimento AI',
          weight: 4,
          skip: () => (settings.recognize ? null : 'riconoscimento AI disattivato'),
          run: async () => {
            const count = await get().runAiRecognition({ ...DEFAULT_AI_OPTIONS });
            if (cancelled()) return { ok: false };
            report.aiFeatures = count;
            report.buildings = get().project.ai?.buildings ?? 0;
            report.trees = get().project.ai?.trees ?? 0;
            const job = get().aiJob;
            return job.error
              ? { ok: false, warning: `AI: ${job.error}` }
              : { ok: true, count, warning: count ? undefined : 'AI: nessun simbolo generato' };
          },
        },
        {
          id: 'contours',
          label: 'Curve di livello',
          weight: 2,
          skip: () => {
            if (!settings.contours) return 'curve di livello disattivate';
            return get().project.imageBBox ? null : 'immagine non georeferenziata';
          },
          run: async () => {
            await get().runDemContours(get().project.contourInterval || 10);
            if (cancelled()) return { ok: false };
            report.contours = get().project.contours.length;
            const job = get().demJob;
            return job.error
              ? { ok: false, warning: `DEM: ${job.error}` }
              : { ok: true, count: report.contours };
          },
        },
        {
          id: 'fusion',
          label: 'Livello simboli unico',
          weight: 1,
          skip: () => (get().project.features.length ? null : 'nessun simbolo da unificare'),
          run: async () => {
            const removed = get().runSymbolFusion();
            if (cancelled()) return { ok: false };
            report.fusedRemoved = removed;
            report.totalFeatures = get().project.features.length;
            return { ok: true, count: removed };
          },
        },
      ];

      try {
        const outcome = await runAutoPipeline(stages, { onProgress: progress, isCancelled: cancelled });
        report.warnings = outcome.warnings;
        report.durationMs = outcome.durationMs;
        report.osmWays = get().project.osmWays.length;
        report.osmFeatures = get().project.features.filter((feature) => feature.source === 'osm').length;
        report.totalFeatures = get().project.features.length;
        if (outcome.cancelled) {
          // A project or image change invalidates this run; do not touch the
          // new project's view or report state.
          if (runId === autoSequence && get().project.id === startProjectId) {
            set({
              autoReport: report,
              autoJob: { ...idleJob(), phase: 'Elaborazione annullata', result: null },
            });
          }
          return report;
        }
        // The resulting symbol layer is the working view: show it and the
        // classification overlay, without changing provenance or verification.
        get().apply((draft) => {
          draft.layers.features.visible = true;
          if (draft.classification) draft.layers.classification.visible = true;
          if (draft.contours.length) draft.layers.contours.visible = true;
        });
        const summary = autoReportSummary(report);
        set({
          autoReport: report,
          autoJob: {
            running: false,
            percent: 100,
            phase: 'Elaborazione completata',
            error: null,
            result: summary,
          },
        });
        return report;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore durante l’elaborazione automatica.';
        report.warnings.push(message);
        if (runId === autoSequence && get().project.id === startProjectId) {
          set({
            autoReport: report,
            autoJob: { ...idleJob(), error: message },
          });
        }
        return report;
      }
    },

    cancelAutomaticPipeline: () => {
      autoCancelled = true;
      get().cancelOsmFetch();
      get().cancelClassification();
      get().cancelVectorization();
      get().cancelAiRecognition();
      get().cancelDemContours();
    },

    runOsmFetch: async (options = {}) => {
      const { project, osmJob } = get();
      if (osmJob.running) return;
      if (!project.imageBBox || !project.worldFile) {
        set({ osmJob: { ...idleJob(), error: 'OSM richiede una georeferenziazione valida (immagine + world file + eventuale .prj).' } });
        return;
      }
      const controller = new AbortController();
      osmAbort = controller;
      set({ osmJob: { running: true, percent: 0, phase: 'Avvio OSM', error: null, result: null } });
      try {
        const result = await fetchOsmWays(project, project.imageBBox, {
          signal: controller.signal,
          force: options.force,
          onProgress: (percent, phase) => set({ osmJob: { ...get().osmJob, percent, phase } }),
        });
        if (controller.signal.aborted) return;
        if (result.ways.length) {
          get().commit((draft) => {
            draft.osmWays = mergeOsmWays(draft.osmWays, result.ways);
            draft.layers.osm.visible = true;
          });
        }
        set({
          osmJob: {
            running: false,
            percent: 100,
            phase: result.ways.length ? 'OSM importato' : 'Nessun tracciato trovato',
            error: null,
            result: result.ways.length
              ? `${result.ways.length} tracciati da ${result.source}${result.fromCache ? ' (24 h)' : ''}`
              : 'Nessuna strada o corso d’acqua OSM nel bbox. Verificare che l’area sia coperta da OpenStreetMap.',
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          set({ osmJob: { ...idleJob(), phase: 'Richiesta OSM annullata' } });
          return;
        }
        set({
          osmJob: {
            ...idleJob(),
            error: error instanceof Error ? error.message : 'Errore durante la richiesta OSM.',
          },
        });
      } finally {
        if (osmAbort === controller) osmAbort = null;
      }
    },

    cancelOsmFetch: () => osmAbort?.abort(),

    convertOsmToFeatures: () => {
      const project = get().project;
      const added = osmWaysToFeatures(project.osmWays, project.features);
      if (!added.length) {
        set({ osmJob: { ...get().osmJob, result: 'Nessun nuovo tracciato da convertire.' } });
        return 0;
      }
      let fusionRemoved = 0;
      get().commit((draft) => {
        draft.features.push(...added);
        fusionRemoved = fuseDraftSymbols(draft).removed;
        // The unified symbol layer replaces the raw source layer on screen;
        // it can be shown again from the Layers panel when needed.
        draft.layers.osm.visible = false;
      });
      const fusionNote = fusionRemoved ? ` ${fusionRemoved} duplicati automatici uniti.` : '';
      set({
        osmJob: {
          ...get().osmJob,
          result: `${added.length} elementi automatici generati da OSM (edifici, alberi, acqua, verde, strade, sentieri). Livello OSM grezzo nascosto. Non verificati.${fusionNote}`,
        },
      });
      return added.length;
    },

    runOsmFusion: async () => {
      const project = get().project;
      if (!project.osmWays.length) {
        set({ osmJob: { ...idleJob(), error: 'Nessun dato OSM da fondere. Importare prima OpenStreetMap.' } });
        return { features: 0, classified: false };
      }
      const features = get().convertOsmToFeatures();
      if (!get().sourceImage || !project.image) {
        return { features, classified: false };
      }
      if (get().classificationJob.running) {
        return { features, classified: false };
      }
      await get().runClassification({
        ...(project.classification?.params ?? DEFAULT_CLASSIFICATION_PARAMS),
        osmPriorEnabled: true,
      });
      return { features, classified: !get().classificationJob.error && get().classificationJob.percent === 100 };
    },

    clearOsm: () => {
      get().commit((draft) => {
        draft.osmWays = [];
      });
      set({ osmJob: idleJob() });
    },

    runDemContours: async (interval) => {
      const { project, demJob } = get();
      if (demJob.running) return;
      if (!project.imageBBox || !project.image) {
        set({ demJob: { ...idleJob(), error: 'Le curve di livello richiedono una georeferenziazione WGS84.' } });
        return;
      }
      const controller = new AbortController();
      demAbort = controller;
      set({ demJob: { running: true, percent: 0, phase: 'Avvio DEM', error: null, result: null } });
      try {
        const result = await generateContours(
          project.imageBBox,
          project.image.width,
          project.image.height,
          interval,
          {
            signal: controller.signal,
            onProgress: (percent, phase) => set({ demJob: { ...get().demJob, percent, phase } }),
          },
        );
        if (controller.signal.aborted) return;
        get().commit((draft) => {
          draft.contours = result.lines;
          draft.contourInterval = interval;
          draft.layers.contours.visible = true;
        });
        set({
          demJob: {
            running: false,
            percent: 100,
            phase: 'Curve generate',
            error: null,
            result: `${result.lines.length} curve · quota ${Math.round(result.minElevation)}–${Math.round(result.maxElevation)} m (indicativa)`,
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          set({ demJob: { ...idleJob(), phase: 'Generazione curve annullata' } });
          return;
        }
        set({
          demJob: {
            ...idleJob(),
            error: error instanceof Error ? error.message : 'Errore durante la generazione delle curve.',
          },
        });
      } finally {
        if (demAbort === controller) demAbort = null;
      }
    },

    cancelDemContours: () => demAbort?.abort(),

    clearContours: () => {
      get().commit((draft) => {
        draft.contours = [];
      });
      set({ demJob: idleJob() });
    },

    clearLoadError: () => set({ loadError: null }),
  };
});

export function selectCourseFeatures(project: Project): Feature[] {
  return project.features
    .filter((f) => f.kind === 'point' && ['start', 'control', 'finish'].includes(f.type))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function selectVerifiedCount(project: Project): number {
  return project.features.filter((f) => f.verified).length;
}

export function exportLabelsBase64(labels: Uint8Array): string {
  return labelsToBase64(labels);
}

export async function persistProjectNow(project: Project): Promise<void> {
  await saveProject(project);
  setLastProjectId(project.id);
}
