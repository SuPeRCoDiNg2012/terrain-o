import { useEffect, useRef, useState } from 'react';
import type { Feature, Point } from '../../model/types';
import { createFeature } from '../../model/constants';
import { useProjectStore } from '../../store/projectStore';
import { useUiStore } from '../uiStore';
import { toast } from '../toastStore';
import { askCalibrationDistance } from '../dialogStore';
import {
  featureBounds,
  hitTest,
  pointDistance,
  pointInFeature,
  snapPoint,
} from '../../edit/geometry';
import { drawProject } from '../../render/scene';
import { pixelToWgs84, wgs84ToMercator } from '../../geo/projection';
import { Icon } from './Icon';
import { Minimap } from './Minimap';
import { useLayoutStore } from '../shell/layoutStore';
import { Rulers } from '../shell/Rulers';
import { MapLegend } from '../shell/MapLegend';
import { CanvasStageOverlay } from './CanvasStageOverlay';

interface MapStageProps {
  onFiles: (files: File[]) => void;
  onOpenFilePicker: () => void;
  onOpenHelp: () => void;
}

type DragMode =
  | 'pan'
  | 'move'
  | 'vertex'
  | 'rubber'
  | 'draw-tap'
  | 'calibrate-tap'
  | 'empty-tap'
  | 'lasso-draw'
  | 'lasso-tap'
  | 'zoom-tap'
  | 'sample-tap';

interface DragState {
  mode: DragMode;
  pointerId: number;
  startClient: { x: number; y: number };
  startWorld: Point;
  lastWorld: Point;
  startView: { scale: number; tx: number; ty: number };
  vertexIndex?: number;
  featureId?: string;
  historyPushed?: boolean;
  initialSelection?: string[];
  moved?: boolean;
}

interface PinchState {
  startDistance: number;
  startCenter: { x: number; y: number };
  startView: { scale: number; tx: number; ty: number };
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 40;

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-12) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * True when a feature actually intersects the free-hand lasso. Testing only
 * vertices and the bbox centre (the old behaviour) missed large areas that
 * enclosed the lasso and lines that crossed it with both endpoints outside.
 */
function featureTouches(polygon: Point[], feature: Feature): boolean {
  if (feature.kind === 'point') return pointInPolygon(feature.coords[0], polygon);
  if (feature.coords.some((point) => pointInPolygon(point, polygon))) return true;
  if (feature.kind === 'area' && polygon.some((point) => pointInFeature(feature, point))) return true;

  const edges = feature.coords.length - 1;
  for (let index = 0; index < edges; index++) {
    const a = feature.coords[index];
    const b = feature.coords[index + 1];
    for (let other = 0; other < polygon.length; other++) {
      const c = polygon[other];
      const d = polygon[(other + 1) % polygon.length];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  if (feature.kind === 'area' && feature.coords.length > 2) {
    const a = feature.coords[feature.coords.length - 1];
    const b = feature.coords[0];
    for (let other = 0; other < polygon.length; other++) {
      const c = polygon[other];
      const d = polygon[(other + 1) % polygon.length];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

export function MapStage({ onFiles, onOpenFilePicker, onOpenHelp }: MapStageProps) {
  const project = useProjectStore((state) => state.project);
  const sourceImage = useProjectStore((state) => state.sourceImage);
  const classificationImage = useProjectStore((state) => state.classificationImage);
  const view = useProjectStore((state) => state.view);
  const viewport = useProjectStore((state) => state.viewport);
  const selection = useProjectStore((state) => state.selection);
  const activeTool = useProjectStore((state) => state.activeTool);
  const snapEnabled = useProjectStore((state) => state.snapEnabled);
  const gridEnabled = useProjectStore((state) => state.gridEnabled);
  const gridSize = useProjectStore((state) => state.gridSize);
  const fitNonce = useProjectStore((state) => state.fitNonce);
  const minimapVisible = useProjectStore((state) => state.minimapVisible);

  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const spaceRef = useRef(false);
  const lastFitRef = useRef(-1);
  const resetCursorRef = useRef<number | null>(null);
  const lassoRef = useRef<Point[]>([]);
  const layout = useLayoutStore();
  const cursor = useUiStore((state) => state.cursor);
  const vectorPreview = useUiStore((state) => state.vectorPreview);
  const classificationPreview = useUiStore((state) => state.classificationPreview);
  const setSampledColor = useUiStore((state) => state.setSampledColor);

  const [lasso, setLasso] = useState<Point[]>([]);
  const [draft, setDraft] = useState<Point[]>([]);
  const [draftKind, setDraftKind] = useState<'area' | 'line' | null>(null);
  const [rubber, setRubber] = useState<{ start: Point; end: Point } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [calibrationStart, setCalibrationStart] = useState<Point | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [zoomBusy, setZoomBusy] = useState(false);

  const setView = useProjectStore((state) => state.setView);
  const setViewport = useProjectStore((state) => state.setViewport);
  const fitImage = useProjectStore((state) => state.fitImage);
  const setTool = useProjectStore((state) => state.setTool);
  const select = useProjectStore((state) => state.select);
  const toggleSelect = useProjectStore((state) => state.toggleSelect);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const pushUndo = useProjectStore((state) => state.pushUndo);
  const updateVertexLive = useProjectStore((state) => state.updateVertexLive);
  const moveSelectionLive = useProjectStore((state) => state.moveSelectionLive);
  const addFeature = useProjectStore((state) => state.addFeature);
  const addCoursePoint = useProjectStore((state) => state.addCoursePoint);
  const addVertex = useProjectStore((state) => state.addVertex);
  const setCalibration = useProjectStore((state) => state.setCalibration);
  const setMinimapVisible = useProjectStore((state) => state.setMinimapVisible);
  const setCursor = useUiStore((state) => state.setCursor);

  const updateCursor = (world: Point) => {
    const insideImage =
      Boolean(project.image) &&
      world.x >= 0 &&
      world.y >= 0 &&
      world.x <= (project.image?.width ?? 0) &&
      world.y <= (project.image?.height ?? 0);
    const geo = insideImage || project.image ? pixelToWgs84(project, world) : null;
    setCursor({
      px: world.x,
      py: world.y,
      lon: geo?.[0] ?? null,
      lat: geo?.[1] ?? null,
      mercator: geo ? wgs84ToMercator(geo[0], geo[1]) : null,
      insideImage,
    });
  };

  const clientToLocal = (clientX: number, clientY: number): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const screenToWorld = (screen: Point): Point => ({
    x: (screen.x - view.tx) / view.scale,
    y: (screen.y - view.ty) / view.scale,
  });

  const worldToScreen = (world: Point): Point => ({
    x: world.x * view.scale + view.tx,
    y: world.y * view.scale + view.ty,
  });

  const applySnap = (world: Point, excludeIds?: Set<string>): Point => {
    if (!snapEnabled && !gridEnabled) return world;
    const result = snapPoint(world, {
      features: project.features,
      excludeIds,
      vertexRadius: 10 / view.scale,
      gridEnabled,
      gridSize,
    });
    return result.point;
  };

  const fitOnce = () => {
    if (!project.image || viewport.width < 5 || viewport.height < 5) return;
    if (lastFitRef.current === fitNonce) return;
    lastFitRef.current = fitNonce;
    fitImage();
  };

  useEffect(() => {
    fitOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce, viewport.width, viewport.height, project.image?.assetId]);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport(rect.width, rect.height);
    });
    observer.observe(element);
    const rect = element.getBoundingClientRect();
    setViewport(rect.width, rect.height);
    return () => observer.disconnect();
  }, [setViewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const render = () => {
      frame = 0;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const width = Math.max(1, viewport.width);
      const height = Math.max(1, viewport.height);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(view.tx, view.ty);
      ctx.scale(view.scale, view.scale);
      drawProject(
        ctx,
        project,
        { source: sourceImage, classification: classificationImage },
        {
          unit: 1 / view.scale,
          selected: new Set(selection),
          // Labels and vertex handles stay quiet on multi-selection: showing
          // every vertex of hundreds of automatic polygons is unreadable.
          labels: selection.length <= 1 ? 'selected' : 'none',
          showCourseCodes: true,
        },
      );
      ctx.restore();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [project, sourceImage, classificationImage, view, viewport.width, viewport.height, selection]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const state = useProjectStore.getState();
      const local = clientToLocal(event.clientX, event.clientY);
      const old = state.view;
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.04 : 0.0015));
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, old.scale * factor));
      const world = { x: (local.x - old.tx) / old.scale, y: (local.y - old.ty) / old.scale };
      state.setView(
        {
          scale,
          tx: local.x - world.x * scale,
          ty: local.y - world.y * scale,
        },
        true,
      );
      setZoomBusy(true);
      if (resetCursorRef.current) window.clearTimeout(resetCursorRef.current);
      resetCursorRef.current = window.setTimeout(() => setZoomBusy(false), 350);
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // A modal or an open menu owns Escape/Enter/Space. Acting on the map at
      // the same time made Escape close a menu AND cancel the current draft.
      if (document.querySelector('.dialog-backdrop') || document.querySelector('.menu-popup')) return;
      if (target?.closest('.menu-bar')) return;
      // Keep Space/Enter usable for keyboard activation of focused controls.
      const control = target?.closest('button, a, [role="button"], [role="tab"]');
      if (control && (event.code === 'Space' || event.key === 'Enter')) return;
      if (event.code === 'Space') {
        spaceRef.current = true;
        event.preventDefault();
      }
      if (event.key === 'Escape') {
        if (draft.length) {
          setDraft([]);
          setDraftKind(null);
          setHoverPoint(null);
          event.preventDefault();
          return;
        }
        if (calibrationStart) {
          setCalibrationStart(null);
          event.preventDefault();
          return;
        }
        if (activeTool !== 'select') {
          setTool('select');
          event.preventDefault();
          return;
        }
        clearSelection();
      }
      if (event.key === 'Enter' && draft.length) {
        finishDraft();
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, calibrationStart, activeTool, clearSelection, setTool]);

  useEffect(() => {
    // A new project or a replaced source must not leave a half-drawn polygon
    // that would be committed into the new image later.
    setDraft([]);
    setDraftKind(null);
    setHoverPoint(null);
    setCalibrationStart(null);
    setRubber(null);
    lassoRef.current = [];
    setLasso([]);
    dragRef.current = null;
  }, [project.id, project.image?.assetId]);

  useEffect(() => {
    if (activeTool !== 'draw-area' && activeTool !== 'draw-line' && draft.length) {
      setDraft([]);
      setDraftKind(null);
    }
    if (activeTool !== 'calibrate' && calibrationStart) setCalibrationStart(null);
    if (activeTool !== 'lasso' && lassoRef.current.length) {
      lassoRef.current = [];
      setLasso([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  const finishDraft = () => {
    if (!draft.length || !draftKind) return;
    let coords = [...draft];
    if (draftKind === 'area') {
      if (coords.length >= 3 && pointDistance(coords[0], coords[coords.length - 1]) <= 8 / view.scale) {
        coords = coords.slice(0, -1);
      }
      if (coords.length < 3) {
        toast('Un\'area richiede almeno 3 vertici.', 'warning');
        return;
      }
      const feature = createFeature('area', 'forest', coords, { name: 'Nuova area' });
      addFeature(feature);
    } else {
      if (coords.length < 2) {
        toast('Una linea richiede almeno 2 vertici.', 'warning');
        return;
      }
      const feature = createFeature('line', 'path', coords, { name: 'Nuova linea' });
      addFeature(feature);
    }
    setDraft([]);
    setDraftKind(null);
    setHoverPoint(null);
  };

  const handleDrawTap = (event: React.PointerEvent) => {
    if (!project.image) return;
    if (activeTool === 'draw-point') {
      const local = clientToLocal(event.clientX, event.clientY);
      const world = applySnap(screenToWorld(local));
      if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return;
      addCoursePoint('control', world);
      return;
    }
    if (activeTool !== 'draw-area' && activeTool !== 'draw-line') return;
    const kind = activeTool === 'draw-area' ? 'area' : 'line';
    if (draftKind && draftKind !== kind) {
      setDraft([]);
    }
    const local = clientToLocal(event.clientX, event.clientY);
    const world = applySnap(screenToWorld(local));
    setDraftKind(kind);
    if (draft.length >= 3 && kind === 'area' && pointDistance(world, draft[0]) <= 8 / view.scale) {
      finishDraft();
      return;
    }
    // A double click delivers two taps at the same screen position. Ignoring the
    // duplicate keeps the closing vertex unique and avoids degenerate rings.
    const last = draft[draft.length - 1];
    if (last && pointDistance(world, last) * view.scale < 2) return;
    setDraft((previous) => [...previous, world]);
  };

  const existingCalibrationSamples = () => {
    if (!project.calibration) return [];
    return [
      {
        a: project.calibration.a,
        b: project.calibration.b,
        meters: project.calibration.meters,
      },
      ...(project.calibration.extraSamples ?? []),
    ];
  };

  const handleCalibrationTap = async (world: Point) => {
    if (!calibrationStart) {
      setCalibrationStart(world);
      toast('Primo punto impostato. Ora clicca il secondo punto sul terreno.', 'info');
      return;
    }
    const first = calibrationStart;
    setCalibrationStart(null);
    const distance = await askCalibrationDistance(100);
    if (!distance) return;
    setCalibration([...existingCalibrationSamples(), { a: first, b: world, meters: distance }]);
    const scale = useProjectStore.getState().project.calibration?.mPerPx;
    toast(
      scale
        ? `Calibrazione applicata: ${scale.toFixed(3)} m/px (${existingCalibrationSamples().length + 1} misure).`
        : 'Calibrazione applicata.',
      'success',
    );
    setTool('select');
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!project.image) return;
    const local = clientToLocal(event.clientX, event.clientY);
    const world = screenToWorld(local);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      pinchRef.current = {
        startDistance: Math.max(1, distance),
        startCenter: clientToLocal(center.x, center.y),
        startView: { ...view },
      };
      dragRef.current = null;
      setRubber(null);
      return;
    }

    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    const startDrag = (mode: DragMode, extra: Partial<DragState> = {}) => {
      dragRef.current = {
        mode,
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startWorld: world,
        lastWorld: world,
        startView: { ...view },
        ...extra,
      };
    };

    if (event.button === 1 || event.button === 2 || spaceRef.current || activeTool === 'pan') {
      startDrag('pan');
      return;
    }
    if (activeTool === 'zoom') {
      startDrag('zoom-tap', { startClient: { x: event.clientX, y: event.clientY } });
      return;
    }
    if (activeTool === 'eyedropper') {
      startDrag('sample-tap');
      return;
    }
    if (activeTool === 'marquee') {
      if (!event.shiftKey) clearSelection();
      startDrag('rubber', { initialSelection: event.shiftKey ? selection : [] });
      setRubber({ start: world, end: world });
      return;
    }
    if (activeTool === 'lasso') {
      if (layout.lassoPolygon) {
        startDrag('lasso-tap');
      } else {
        startDrag('lasso-draw');
        lassoRef.current = [world];
        setLasso([world]);
      }
      return;
    }
    if (activeTool === 'draw-area' || activeTool === 'draw-line' || activeTool === 'draw-point') {
      startDrag('draw-tap');
      return;
    }
    if (activeTool === 'calibrate') {
      startDrag('calibrate-tap');
      return;
    }

    // Select tool.
    if (selection.length === 1) {
      const feature = project.features.find((f) => f.id === selection[0]);
      if (feature) {          const nearest = feature.coords.reduce(
            (best, point, index) => {
              const distance = pointDistance(world, point) * view.scale;
              return distance <= layout.selectionTolerance && distance < best.distance ? { index, distance } : best;
            },
            { index: -1, distance: Infinity },
          );
        if (nearest.index >= 0) {
          startDrag('vertex', { featureId: feature.id, vertexIndex: nearest.index });
          return;
        }
      }
    }

    const hit = hitTest(project.features, world, { tolerancePx: layout.selectionTolerance / view.scale });
    if (hit) {
      if (event.shiftKey) {
        toggleSelect(hit.id);
        return;
      }
      if (!selection.includes(hit.id)) select([hit.id]);
      startDrag('move', { featureId: hit.id });
      return;
    }

    if (event.pointerType === 'touch') {
      startDrag('pan');
      return;
    }
    if (!event.shiftKey) clearSelection();
    startDrag('rubber', { initialSelection: event.shiftKey ? selection : [] });
    setRubber({ start: world, end: world });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const local = clientToLocal(event.clientX, event.clientY);
    const world = screenToWorld(local);
    updateCursor(world);

    if (pinchRef.current && pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      const centerClient = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const center = clientToLocal(centerClient.x, centerClient.y);
      const pinch = pinchRef.current;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.startView.scale * (distance / pinch.startDistance)));
      const worldAtStart = {
        x: (pinch.startCenter.x - pinch.startView.tx) / pinch.startView.scale,
        y: (pinch.startCenter.y - pinch.startView.ty) / pinch.startView.scale,
      };
      setView(
        {
          scale,
          tx: center.x - worldAtStart.x * scale,
          ty: center.y - worldAtStart.y * scale,
        },
        false,
      );
      return;
    }

    const drag = dragRef.current;
    if (!drag) {
      if (activeTool === 'draw-area' || activeTool === 'draw-line' || activeTool === 'draw-point' || activeTool === 'calibrate') {
        setHoverPoint(applySnap(world));
      }
      return;
    }

    const moved = Math.hypot(local.x - clientToLocal(drag.startClient.x, drag.startClient.y).x, local.y - clientToLocal(drag.startClient.x, drag.startClient.y).y);
    if (moved > 3) drag.moved = true;

    if (drag.mode === 'pan') {
      setView(
        {
          scale: drag.startView.scale,
          tx: drag.startView.tx + (event.clientX - drag.startClient.x),
          ty: drag.startView.ty + (event.clientY - drag.startClient.y),
        },
        false,
      );
      return;
    }

    if (drag.mode === 'rubber') {
      setRubber({ start: drag.startWorld, end: world });
      return;
    }

    if (drag.mode === 'lasso-draw') {
      if (!drag.moved) return;
      const last = lassoRef.current[lassoRef.current.length - 1];
      if (last && pointDistance(last, world) < 2 / view.scale) return;
      if (lassoRef.current.length > 4000) return;
      lassoRef.current = [...lassoRef.current, world];
      setLasso(lassoRef.current);
      return;
    }

    if (drag.mode === 'vertex') {
      if (!drag.moved) return;
      if (!drag.historyPushed) {
        pushUndo();
        drag.historyPushed = true;
      }
      const feature = project.features.find((f) => f.id === drag.featureId);
      const excluded = new Set(feature ? [feature.id] : []);
      const snapped = applySnap(world, excluded);
      updateVertexLive(drag.featureId!, drag.vertexIndex!, snapped);
      drag.lastWorld = snapped;
      return;
    }

    if (drag.mode === 'move') {
      if (!drag.moved) return;
      if (!drag.historyPushed) {
        pushUndo();
        drag.historyPushed = true;
      }
      const delta = { x: world.x - drag.lastWorld.x, y: world.y - drag.lastWorld.y };
      if (Math.abs(delta.x) > 1e-9 || Math.abs(delta.y) > 1e-9) {
        moveSelectionLive(delta.x, delta.y);
        drag.lastWorld = world;
      }
      return;
    }

    if (drag.mode === 'draw-tap' || drag.mode === 'calibrate-tap' || drag.mode === 'empty-tap') {
      if (activeTool === 'draw-area' || activeTool === 'draw-line' || activeTool === 'draw-point' || activeTool === 'calibrate') {
        setHoverPoint(applySnap(world));
      }
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
        useProjectStore.getState().recordZoom();
      }
      dragRef.current = null;
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    const movement = drag
      ? Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y)
      : 0;
    const isTap = movement <= 6;

    if (drag?.mode === 'rubber') {
      const endWorld = screenToWorld(clientToLocal(event.clientX, event.clientY));
      const rect = {
        minX: Math.min(drag.startWorld.x, endWorld.x),
        maxX: Math.max(drag.startWorld.x, endWorld.x),
        minY: Math.min(drag.startWorld.y, endWorld.y),
        maxY: Math.max(drag.startWorld.y, endWorld.y),
      };
      const ids = new Set(drag.initialSelection ?? []);
      if (rect.maxX - rect.minX > 3 || rect.maxY - rect.minY > 3) {
        for (const feature of project.features) {
          const bounds = featureBounds(feature);
          const intersects =
            bounds.maxX >= rect.minX &&
            bounds.minX <= rect.maxX &&
            bounds.maxY >= rect.minY &&
            bounds.minY <= rect.maxY;
          if (intersects) ids.add(feature.id);
        }
        select([...ids]);
      }
      setRubber(null);
      return;
    }

    if (drag?.mode === 'lasso-draw') {
      finishLasso(lassoRef.current);
      return;
    }

    if (drag?.mode === 'lasso-tap' && isTap) {
      const world = applySnap(screenToWorld(clientToLocal(event.clientX, event.clientY)));
      const points = [...lassoRef.current];
      if (points.length >= 3 && pointDistance(world, points[0]) <= 8 / view.scale) {
        finishLasso(points);
        return;
      }
      points.push(world);
      lassoRef.current = points;
      setLasso(points);
      return;
    }

    if (drag?.mode === 'zoom-tap' && isTap) {
      zoomAtScreen(clientToLocal(event.clientX, event.clientY), event.altKey ? 0.75 : 1.35);
      return;
    }

    if (drag?.mode === 'sample-tap' && isTap) {
      sampleAt(screenToWorld(clientToLocal(event.clientX, event.clientY)));
      return;
    }

    if (!isTap) {
      if (drag?.mode === 'move' || drag?.mode === 'vertex') {
        setHoverPoint(null);
      }
      return;
    }

    if (drag?.mode === 'draw-tap') {
      handleDrawTap(event);
      return;
    }
    if (drag?.mode === 'calibrate-tap') {
      const world = screenToWorld(clientToLocal(event.clientX, event.clientY));
      void handleCalibrationTap(world);
      return;
    }
    if (drag?.mode === 'pan' && event.pointerType === 'touch') {
      clearSelection();
      return;
    }
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    if (!project.image) return;
    if (draft.length) {
      finishDraft();
      return;
    }
    if (activeTool !== 'select') return;
    const world = screenToWorld(clientToLocal(event.clientX, event.clientY));
    const hit = hitTest(project.features, world, { tolerancePx: layout.selectionTolerance / view.scale });
    if (hit && selection.includes(hit.id) && hit.kind !== 'point') {
      addVertex(hit.id, applySnap(world, new Set([hit.id])));
    }
  };

  const cancelInteraction = () => {
    setDraft([]);
    setDraftKind(null);
    setCalibrationStart(null);
    setHoverPoint(null);
    setRubber(null);
    dragRef.current = null;
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  };

  const zoomButton = (factor: number) => {
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const world = { x: (center.x - view.tx) / view.scale, y: (center.y - view.ty) / view.scale };
    setView({ scale, tx: center.x - world.x * scale, ty: center.y - world.y * scale }, true);
  };

  const zoomAtScreen = (local: Point, factor: number) => {
    const world = screenToWorld(local);
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
    setView({ scale, tx: local.x - world.x * scale, ty: local.y - world.y * scale }, true);
  };

  const finishLasso = (points: Point[]) => {
    if (points.length >= 3) {
      const ids = project.features.filter((feature) => featureTouches(points, feature)).map((feature) => feature.id);
      select(ids);
    }
    lassoRef.current = [];
    setLasso([]);
  };

  const sampleAt = (world: Point) => {
    if (!sourceImage || !project.image) return;
    const x = Math.floor(world.x);
    const y = Math.floor(world.y);
    if (x < 0 || y < 0 || x >= project.image.width || y >= project.image.height) return;
    const readPixel = (image: CanvasImageSource, sx: number, sy: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      const hex = `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
      return { r, g, b, a, hex };
    };
    const source = readPixel(sourceImage, x, y);
    if (!source) return;
    let classification: { r: number; g: number; b: number; a: number; hex: string } | null = null;
    if (classificationImage && project.classification) {
      const cx = Math.min(project.classification.width - 1, Math.floor((x / project.image.width) * project.classification.width));
      const cy = Math.min(project.classification.height - 1, Math.floor((y / project.image.height) * project.classification.height));
      classification = readPixel(classificationImage, cx, cy);
    }
    setSampledColor({ ...source, x, y, classification });
  };

  useEffect(() => {
    if (activeTool !== 'lasso' || !layout.lassoPolygon) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('.dialog-backdrop') || document.querySelector('.menu-popup')) return;
      if (event.key === 'Enter' && lassoRef.current.length >= 3) {
        event.preventDefault();
        finishLasso(lassoRef.current);
      }
      if (event.key === 'Escape') {
        lassoRef.current = [];
        setLasso([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, layout.lassoPolygon, project.features, select]);

  const selectedFeatures = project.features.filter((f) => selection.includes(f.id));
  const draftPreview = hoverPoint && draft.length ? [...draft, hoverPoint] : draft;
  const closeHint =
    draftKind === 'area' && draft.length >= 3 && hoverPoint
      ? pointDistance(hoverPoint, draft[0]) <= 8 / view.scale
      : false;

  const gridLines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
  if (gridEnabled && project.image) {
    const step = gridSize * view.scale;
    if (step >= 7) {
      const minX = Math.max(0, Math.floor((-view.tx / view.scale) / gridSize) * gridSize);
      const maxX = Math.min(project.image.width, (viewport.width - view.tx) / view.scale);
      const minY = Math.max(0, Math.floor((-view.ty / view.scale) / gridSize) * gridSize);
      const maxY = Math.min(project.image.height, (viewport.height - view.ty) / view.scale);
      let count = 0;
      for (let x = minX; x <= maxX && count < 400; x += gridSize, count++) {
        const screenX = x * view.scale + view.tx;
        gridLines.push({ id: `gx-${x}`, x1: screenX, y1: 0, x2: screenX, y2: viewport.height });
      }
      count = 0;
      for (let y = minY; y <= maxY && count < 400; y += gridSize, count++) {
        const screenY = y * view.scale + view.ty;
        gridLines.push({ id: `gy-${y}`, x1: 0, y1: screenY, x2: viewport.width, y2: screenY });
      }
    }
  }

  const previewPaths = (vectorPreview ?? []).map((region, index) => {
    const ring = (points: Point[]) => {
      if (!points.length) return '';
      const parts = points.map((point) => {
        const screen = worldToScreen(point);
        return `${screen.x.toFixed(2)},${screen.y.toFixed(2)}`;
      });
      return `M${parts[0]} L${parts.slice(1).join(' L')} Z`;
    };
    return {
      id: `${region.type}-${index}`,
      d: [ring(region.coords), ...region.holes.map(ring)].filter(Boolean).join(' '),
    };
  });

  const cursorScreen = cursor && layout.crosshair ? { x: cursor.px * view.scale + view.tx, y: cursor.py * view.scale + view.ty } : null;


  return (
    <section
      className={`map-stage ${dragActive ? 'drag-active' : ''}`}
      ref={stageRef}
      aria-label="Area mappa"
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      <div
        className="map-surface"
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          pointersRef.current.delete(event.pointerId);
          pinchRef.current = null;
          setRubber(null);
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          if (!dragRef.current && pointersRef.current.size === 0) {
            setCursor(null);
            setHoverPoint(null);
          }
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          cursor:
            activeTool === 'pan' || spaceRef.current
              ? dragRef.current
                ? 'grabbing'
                : 'grab'
              : activeTool === 'select'
                ? 'default'
                : activeTool === 'zoom'
                  ? 'zoom-in'
                  : activeTool === 'eyedropper'
                    ? 'copy'
                    : 'crosshair',
        }}
      >
        <canvas ref={canvasRef} className="map-canvas" aria-hidden="true" />
        {classificationPreview && project.image && (
          <img
            src={classificationPreview}
            alt=""
            aria-hidden="true"
            className="classification-preview-layer"
            draggable={false}
            style={{
              width: project.image.width,
              height: project.image.height,
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            }}
          />
        )}
        {!project.image && (
          <div className="stage-empty">
            <div className="stage-empty-card">
              <div className="stage-empty-mark"><Icon name="mountain" size={34} /></div>
              <div className="eyebrow">Studio cartografico locale</div>
              <h2>Inizia da un'ortofoto</h2>
              <p>
                Importa una o più immagini JPG/PNG. Trascina insieme il world file e il <code>.prj</code> per la
                georeferenziazione; senza world file le misure restano in pixel.
              </p>
              <div className="stage-empty-actions">
                <button type="button" className="btn btn-primary" onClick={onOpenFilePicker}>
                  <Icon name="import" size={18} /> Scegli file
                </button>
                <button type="button" className="btn btn-ghost" onClick={onOpenHelp}>
                  Come funziona
                </button>
              </div>
              <div className="drop-hint">
                <Icon name="image" size={16} /> JPG/PNG + .jgw/.jpgw/.pgw/.pngw/.wld + .prj
              </div>
              <p className="tiny muted">
                Terrain / O è uno strumento di bozza. Nessuna dichiarazione automatica di percorribilità, quota o conformità IOF.
              </p>
            </div>
          </div>
        )}
        {project.image && !sourceImage && (
          <div className="stage-overlay-message">Caricamento immagine sorgente…</div>
        )}
        {selection.length > 0 && !project.image && <div className="stage-overlay-message">Nessuna immagine caricata.</div>}
      </div>

      {project.image && (
        <>
          {layout.rulers && (
            <Rulers view={view} viewport={viewport} project={project} unit={layout.rulerUnit} cursor={cursor} />
          )}
          <CanvasStageOverlay
            viewport={viewport}
            worldToScreen={worldToScreen}
            gridLines={gridLines}
            previewPaths={previewPaths}
            lasso={lasso}
            selectedFeatures={selectedFeatures}
            draft={draft}
            draftPreview={draftPreview}
            draftKind={draftKind}
            closeHint={closeHint}
            hoverPoint={hoverPoint}
            rubber={rubber}
            calibrationStart={calibrationStart}
            cursorScreen={cursorScreen}
          />

          <MapLegend />

          {(draft.length > 0 || activeTool === 'calibrate') && (
            <div className="draft-bar" data-stage-interactive>
              {activeTool === 'calibrate' ? (
                <span>
                  {calibrationStart
                    ? 'Secondo punto: clicca sul terreno. La distanza verrà chiesta subito dopo.'
                    : 'Primo punto: clicca un dettaglio riconoscibile sull\'ortofoto.'}
                </span>
              ) : (
                <span>
                  {draftKind === 'area'
                    ? 'Clicca i vertici dell\'area. Clicca il primo punto o premi Invio per chiudere.'
                    : 'Clicca i vertici della linea. Premi Invio per terminare.'}
                </span>
              )}
              <div className="draft-actions">
                {activeTool !== 'calibrate' && (
                  <button type="button" className="btn btn-primary btn-small" onClick={finishDraft}>
                    Termina
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-small" onClick={cancelInteraction}>
                  Annulla
                </button>
              </div>
            </div>
          )}

          <div className="zoom-controls" data-stage-interactive>
            <button type="button" className="tool-button" onClick={() => zoomButton(1.2)} aria-label="Ingrandisci" title="Ingrandisci">
              <Icon name="plus" />
            </button>
            <button type="button" className="tool-button" onClick={() => zoomButton(1 / 1.2)} aria-label="Riduci" title="Riduci">
              <Icon name="minus" />
            </button>
            <button type="button" className="tool-button" onClick={() => fitImage()} aria-label="Adatta immagine" title="Adatta immagine">
              <Icon name="fit" />
            </button>
          </div>

          {minimapVisible ? (
            <Minimap onClose={() => setMinimapVisible(false)} />
          ) : (
            <button type="button" className="minimap-reopen" onClick={() => setMinimapVisible(true)} data-stage-interactive aria-label="Mostra minimappa">
              <Icon name="map" size={16} /> Minimappa
            </button>
          )}

          {(project.osmWays.length > 0 || project.contours.length > 0) && (
            <div className="map-attribution" aria-hidden="true">
              {project.osmWays.length > 0 && '© OpenStreetMap contributors'}
              {project.osmWays.length > 0 && project.contours.length > 0 && ' · '}
              {project.contours.length > 0 && 'DEM AWS Terrain Tiles — quota indicativa'}
            </div>
          )}
          {zoomBusy && <div className="zoom-hint">{Math.round(view.scale * 100)}%</div>}
        </>
      )}

      {dragActive && (
        <div className="drop-overlay">
          <div>
            <Icon name="import" size={28} />
            <strong>Rilascia immagine, world file e .prj</strong>
            <span>L'importazione sostituirà la sorgente solo dopo conferma.</span>
          </div>
        </div>
      )}
    </section>
  );
}
