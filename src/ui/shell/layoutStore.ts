import { create } from 'zustand';

export type PanelId =
  | 'project'
  | 'layers'
  | 'features'
  | 'properties'
  | 'classification'
  | 'vectorize'
  | 'ai'
  | 'history'
  | 'info'
  | 'navigator'
  | 'osm'
  | 'dem'
  | 'course';

export type DockSide = 'left' | 'right' | 'bottom';
export type RulerUnit = 'px' | 'm' | 'deg';

export const PANEL_LABELS: Record<PanelId, { label: string; short: string }> = {
  project: { label: 'Progetto e immagini', short: 'Progetto' },
  layers: { label: 'Livelli', short: 'Livelli' },
  features: { label: 'Elementi cartografici', short: 'Elementi' },
  properties: { label: 'Proprietà', short: 'Proprietà' },
  classification: { label: 'Classificazione', short: 'Classificazione' },
  vectorize: { label: 'Vettorizzazione', short: 'Vettoriz.' },
  ai: { label: 'Riconoscimento AI', short: 'AI' },
  history: { label: 'Storia', short: 'Storia' },
  info: { label: 'Info', short: 'Info' },
  navigator: { label: 'Navigatore', short: 'Navigatore' },
  osm: { label: 'OpenStreetMap', short: 'OSM' },
  dem: { label: 'Curve di livello', short: 'DEM' },
  course: { label: 'Percorso e controlli', short: 'Percorso' },
};

const STORAGE_KEY = 'terrain-o/ui-layout/v1';

interface PersistedLayout {
  /** Bumped when a new panel is introduced, so saved layouts can add it. */
  version: number;
  left: PanelId[];
  right: PanelId[];
  bottom: PanelId[];
  active: Record<DockSide, PanelId>;
  collapsed: Record<DockSide, boolean>;
  widths: { left: number; right: number; bottom: number };
  rulers: boolean;
  rulerUnit: RulerUnit;
  legend: boolean;
  crosshair: boolean;
  optionsBar: boolean;
  selectionTolerance: number;
  lassoPolygon: boolean;
  lineOffset: number;
}

const DEFAULTS: PersistedLayout = {
  version: 2,
  left: ['project', 'osm', 'dem', 'course'],
  right: ['layers', 'features', 'properties', 'classification', 'vectorize', 'ai', 'history', 'info', 'navigator'],
  bottom: [],
  active: { left: 'project', right: 'layers', bottom: 'history' },
  collapsed: { left: false, right: false, bottom: false },
  widths: { left: 292, right: 320, bottom: 190 },
  rulers: true,
  rulerUnit: 'px',
  legend: false,
  crosshair: false,
  optionsBar: true,
  selectionTolerance: 6,
  lassoPolygon: false,
  lineOffset: 2,
};

function isPanel(value: unknown): value is PanelId {
  return typeof value === 'string' && value in PANEL_LABELS;
}

function sanitizePanels(value: unknown, fallback: PanelId[]): PanelId[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<PanelId>();
  const result: PanelId[] = [];
  for (const item of value) {
    if (isPanel(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function load(): PersistedLayout {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistedLayout>;
    const left = sanitizePanels(parsed.left, DEFAULTS.left);
    const right = sanitizePanels(parsed.right, DEFAULTS.right);
    const bottom = sanitizePanels(parsed.bottom, DEFAULTS.bottom);
    // Layouts saved before the AI panel existed get it appended once, without
    // rearranging the panels the user already positioned.
    if ((parsed.version ?? 1) < 2) {
      const present = new Set<PanelId>([...left, ...right, ...bottom]);
      if (!present.has('ai')) right.push('ai');
    }
    const active = {
      left: isPanel(parsed.active?.left) && left.includes(parsed.active.left) ? parsed.active.left : (left[0] ?? 'project'),
      right: isPanel(parsed.active?.right) && right.includes(parsed.active.right) ? parsed.active.right : (right[0] ?? 'layers'),
      bottom: isPanel(parsed.active?.bottom) && bottom.includes(parsed.active.bottom) ? parsed.active.bottom : (bottom[0] ?? 'history'),
    };
    return {
      version: 2,
      left,
      right,
      bottom,
      active,
      collapsed: {
        left: Boolean(parsed.collapsed?.left),
        right: Boolean(parsed.collapsed?.right),
        bottom: Boolean(parsed.collapsed?.bottom),
      },
      widths: {
        left: clamp(Number(parsed.widths?.left) || DEFAULTS.widths.left, 220, 520),
        right: clamp(Number(parsed.widths?.right) || DEFAULTS.widths.right, 240, 560),
        bottom: clamp(Number(parsed.widths?.bottom) || DEFAULTS.widths.bottom, 120, 420),
      },
      rulers: parsed.rulers ?? DEFAULTS.rulers,
      rulerUnit: parsed.rulerUnit === 'm' || parsed.rulerUnit === 'deg' ? parsed.rulerUnit : 'px',
      legend: Boolean(parsed.legend),
      crosshair: Boolean(parsed.crosshair),
      optionsBar: parsed.optionsBar ?? DEFAULTS.optionsBar,
      selectionTolerance: clamp(Number(parsed.selectionTolerance) || DEFAULTS.selectionTolerance, 1, 24),
      lassoPolygon: Boolean(parsed.lassoPolygon),
      lineOffset: clamp(Number(parsed.lineOffset) || DEFAULTS.lineOffset, 0.5, 20),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface LayoutState extends PersistedLayout {
  setActive: (side: DockSide, panel: PanelId) => void;
  toggleCollapsed: (side: DockSide) => void;
  setWidth: (side: DockSide, width: number) => void;
  movePanel: (panel: PanelId, side: DockSide, index?: number) => void;
  togglePanel: (panel: PanelId) => void;
  isPanelOpen: (panel: PanelId) => boolean;
  setRulers: (visible: boolean) => void;
  setRulerUnit: (unit: RulerUnit) => void;
  setLegend: (visible: boolean) => void;
  setCrosshair: (visible: boolean) => void;
  setOptionsBar: (visible: boolean) => void;
  setSelectionTolerance: (value: number) => void;
  setLassoPolygon: (value: boolean) => void;
  setLineOffset: (value: number) => void;
  resetLayout: () => void;
}

function persist(state: LayoutState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: PersistedLayout = {
      version: 2,
      left: state.left,
      right: state.right,
      bottom: state.bottom,
      active: state.active,
      collapsed: state.collapsed,
      widths: state.widths,
      rulers: state.rulers,
      rulerUnit: state.rulerUnit,
      legend: state.legend,
      crosshair: state.crosshair,
      optionsBar: state.optionsBar,
      selectionTolerance: state.selectionTolerance,
      lassoPolygon: state.lassoPolygon,
      lineOffset: state.lineOffset,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // A full or blocked localStorage must never break the editor.
  }
}

const initial = load();

export const useLayoutStore = create<LayoutState>((set, get) => {
  const update = (patch: Partial<LayoutState>) => {
    set(patch);
    persist(get());
  };

  return {
    ...initial,
    setActive: (side, panel) => {
      if (!get()[side].includes(panel)) return;
      update({ active: { ...get().active, [side]: panel } });
    },
    toggleCollapsed: (side) => {
      update({ collapsed: { ...get().collapsed, [side]: !get().collapsed[side] } });
    },
    setWidth: (side, width) => {
      const limits: Record<DockSide, [number, number]> = {
        left: [220, 520],
        right: [240, 560],
        bottom: [120, 420],
      };
      const [min, max] = limits[side];
      update({ widths: { ...get().widths, [side]: clamp(Math.round(width), min, max) } });
    },
    movePanel: (panel, side, index) => {
      const next: Record<DockSide, PanelId[]> = {
        left: get().left.filter((id) => id !== panel),
        right: get().right.filter((id) => id !== panel),
        bottom: get().bottom.filter((id) => id !== panel),
      };
      const target = [...next[side]];
      const at = index == null ? target.length : clamp(index, 0, target.length);
      target.splice(at, 0, panel);
      next[side] = target;
      update({
        ...next,
        active: { ...get().active, [side]: panel },
        collapsed: { ...get().collapsed, [side]: false },
      });
    },
    togglePanel: (panel) => {
      const sides: DockSide[] = ['left', 'right', 'bottom'];
      for (const side of sides) {
        if (get()[side].includes(panel)) {
          get().setActive(side, panel);
          if (get().collapsed[side]) update({ collapsed: { ...get().collapsed, [side]: false } });
          return;
        }
      }
      get().movePanel(panel, 'right');
    },
    isPanelOpen: (panel) => {
      const state = get();
      return (
        (state.left.includes(panel) && state.active.left === panel && !state.collapsed.left) ||
        (state.right.includes(panel) && state.active.right === panel && !state.collapsed.right) ||
        (state.bottom.includes(panel) && state.active.bottom === panel && !state.collapsed.bottom)
      );
    },
    setRulers: (visible) => update({ rulers: visible }),
    setRulerUnit: (unit) => update({ rulerUnit: unit }),
    setLegend: (visible) => update({ legend: visible }),
    setCrosshair: (visible) => update({ crosshair: visible }),
    setOptionsBar: (visible) => update({ optionsBar: visible }),
    setSelectionTolerance: (value) => update({ selectionTolerance: clamp(Math.round(value), 1, 24) }),
    setLassoPolygon: (value) => update({ lassoPolygon: value }),
    setLineOffset: (value) => update({ lineOffset: clamp(value, 0.5, 20) }),
    resetLayout: () => {
      update({ ...DEFAULTS });
    },
  };
});
