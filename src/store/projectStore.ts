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
  CLASSIFICATION_METHOD,
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
let vectorAbort: AbortController | null = null;
let osmAbort: AbortController | null = null;
let demAbort: AbortController | null = null;
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
  vectorJob: JobState;
  osmJob: JobState;
  demJob: JobState;
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
  runOsmFetch: (options?: { force?: boolean }) => Promise<void>;
  cancelOsmFetch: () => void;
  convertOsmToFeatures: () => number;
  clearOsm: () => void;
  runDemContours: (interval: number) => Promise<void>;
  cancelDemContours: () => void;
  clearContours: () => void;
  clearLoadError: () => void;
}

const now = () => new Date().toISOString();

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
  vectorJob: idleJob(),
  osmJob: idleJob(),
  demJob: idleJob(),
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
      const decoded = decodeLabelAsset(labels, project.classification ? project.classification.width * project.classification.height : null);
      set({
        project,
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
    setGridSize: (gridSize) => set({ gridSize }),
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
        const output = await classifySource(sourceImage, project.image.width, project.image.height, params, {
          signal: controller.signal,
          onProgress: (info) =>
            set({ classificationJob: { ...get().classificationJob, percent: info.percent, phase: info.phase } }),
        });
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
        get().commit((draft) => {
          if (mode === 'replace') {
            draft.features = draft.features.filter((f) => f.source !== 'vector');
          }
          draft.features.push(...features);
        });
        set({
          vectorJob: {
            running: false,
            percent: 100,
            phase: 'Vettorizzazione completata',
            error: null,
            result: `${features.length} aree generate (${mode === 'replace' ? 'sostituite' : 'aggiunte'})`,
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
      get().commit((draft) => {
        draft.features.push(...added);
      });
      set({ osmJob: { ...get().osmJob, result: `${added.length} tracciati convertiti in elementi cartografici` } });
      return added.length;
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
