import { create } from 'zustand';
import type { Point } from '../model/types';

export type UiMode = 'essential' | 'advanced';

export const UI_MODE_KEY = 'terrain-o/ui-mode/v1';

function readUiMode(): UiMode {
  if (typeof localStorage === 'undefined') return 'essential';
  try {
    return localStorage.getItem(UI_MODE_KEY) === 'advanced' ? 'advanced' : 'essential';
  } catch {
    return 'essential';
  }
}

function persistUiMode(mode: UiMode): void {
  try {
    localStorage.setItem(UI_MODE_KEY, mode);
  } catch {
    // A blocked storage must not change how the editor behaves.
  }
}

export interface VectorPreviewRegion {
  type: string;
  coords: Point[];
  holes: Point[][];
}

export interface CursorInfo {
  px: number;
  py: number;
  lon: number | null;
  lat: number | null;
  mercator: [number, number] | null;
  insideImage: boolean;
}

export interface SampledColor {
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
  x: number;
  y: number;
  /** Sample of the automatic classification overlay, when one exists. */
  classification?: { r: number; g: number; b: number; a: number; hex: string } | null;
}

interface UiStore {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
  cursor: CursorInfo | null;
  setCursor: (cursor: CursorInfo | null) => void;
  leftOpen: boolean;
  rightOpen: boolean;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  sampledColor: SampledColor | null;
  setSampledColor: (color: SampledColor | null) => void;
  activeBottomTab: string;
  setActiveBottomTab: (tab: string) => void;
  vectorPreview: VectorPreviewRegion[] | null;
  setVectorPreview: (regions: VectorPreviewRegion[] | null) => void;
  /** Live classification thumbnail painted over the raster, not a layer. */
  classificationPreview: string | null;
  setClassificationPreview: (dataUrl: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  mode: readUiMode(),
  setMode: (mode) => {
    persistUiMode(mode);
    set({ mode });
  },
  cursor: null,
  setCursor: (cursor) => set({ cursor }),
  leftOpen: false,
  rightOpen: false,
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setRightOpen: (rightOpen) => set({ rightOpen }),
  sampledColor: null,
  setSampledColor: (sampledColor) => set({ sampledColor }),
  activeBottomTab: 'log',
  setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab }),
  vectorPreview: null,
  setVectorPreview: (vectorPreview) => set({ vectorPreview }),
  classificationPreview: null,
  setClassificationPreview: (classificationPreview) => set({ classificationPreview }),
}));
