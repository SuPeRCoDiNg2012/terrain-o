import type { ContourLine, Feature, LayerId, Point, Project } from '../model/types';
import { typeSpec } from '../model/constants';
import { courseRoute } from '../geo/projection';
import {
  PROVENANCE_STYLES,
  drawProvenanceCheck,
  featureProvenance,
} from './provenance';

export interface RenderImages {
  source: HTMLImageElement | null;
  classification: HTMLImageElement | null;
}

export interface RenderOptions {
  /** World units per screen/output pixel; keeps strokes readable at any zoom. */
  unit: number;
  selected?: Set<string>;
  labels?: 'none' | 'selected' | 'important';
  showCourseCodes?: boolean;
}

function labelAnchor(feature: Feature): Point {
  if (feature.kind === 'point') return feature.coords[0];
  if (feature.kind === 'line') {
    const middle = feature.coords[Math.floor(feature.coords.length / 2)] ?? feature.coords[0];
    return middle;
  }
  let x = 0;
  let y = 0;
  for (const p of feature.coords) {
    x += p.x;
    y += p.y;
  }
  return { x: x / feature.coords.length, y: y / feature.coords.length };
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  point: Point,
  unit: number,
  color = '#1c1917',
  size = 11,
): void {
  if (!text) return;
  ctx.save();
  ctx.font = `600 ${size * unit}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 3 * unit;
  ctx.strokeText(text, point.x, point.y);
  ctx.fillStyle = color;
  ctx.fillText(text, point.x, point.y);
  ctx.restore();
}

function pathForRing(ctx: CanvasRenderingContext2D, ring: Point[], close: boolean): void {
  if (!ring.length) return;
  ctx.moveTo(ring[0].x, ring[0].y);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
  if (close) ctx.closePath();
}

function fillPolygonWithHoles(
  ctx: CanvasRenderingContext2D,
  feature: Feature,
  fill: string,
  opacity: number,
): void {
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.fillStyle = fill;
  ctx.beginPath();
  pathForRing(ctx, feature.coords, true);
  for (const hole of feature.holes ?? []) pathForRing(ctx, hole, true);
  ctx.fill('evenodd');
  ctx.restore();
}

function strokeFeatureOutline(ctx: CanvasRenderingContext2D, feature: Feature, unit: number, color: string, width: number, dashed = false): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * unit;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.beginPath();
  if (feature.kind === 'area') {
    pathForRing(ctx, feature.coords, true);
    for (const hole of feature.holes ?? []) pathForRing(ctx, hole, true);
  } else {
    pathForRing(ctx, feature.coords, false);
  }
  ctx.stroke();
  ctx.restore();
}

function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: Feature,
  unit: number,
  selected: boolean,
  labels: 'none' | 'selected' | 'important',
): void {
  const spec = typeSpec(feature.type);
  const provenance = PROVENANCE_STYLES[featureProvenance(feature)];
  if (feature.kind === 'area') {
    fillPolygonWithHoles(ctx, feature, spec.fill ?? spec.color, 0.55);
    strokeFeatureOutline(ctx, feature, unit, spec.color, selected ? 3 : 1.6);
  } else if (feature.kind === 'line') {
    ctx.save();
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = (feature.type === 'road' ? 3.2 : feature.type === 'stream' ? 2 : 1.8) * unit;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (feature.type === 'fence') ctx.setLineDash([5 * unit, 3 * unit]);
    ctx.beginPath();
    pathForRing(ctx, feature.coords, false);
    ctx.stroke();
    ctx.restore();
  } else {
    const p = feature.coords[0];
    ctx.save();
    ctx.fillStyle = spec.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * unit;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5 * unit, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Provenance border, neutral and quiet. Automatic geometry is dashed, manual
  // geometry is solid, verified geometry adds a small tick in its corner.
  if (feature.kind !== 'point') {
    strokeFeatureOutline(ctx, feature, unit, provenance.color, provenance.width, provenance.dashed);
  }
  if (provenance.check) {
    let maxX = -Infinity;
    let minY = Infinity;
    for (const point of feature.coords) {
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
    }
    if (Number.isFinite(maxX) && Number.isFinite(minY)) {
      drawProvenanceCheck(ctx, { x: maxX + 7 * unit, y: minY - 7 * unit }, unit);
    }
  }

  if (selected) {
    strokeFeatureOutline(ctx, feature, unit, '#38bdf8', 2.4, false);
  }

  const wantsLabel =
    labels === 'selected' ? selected : labels === 'important' ? feature.source === 'manual' || feature.verified : false;
  if (wantsLabel && feature.name && feature.kind !== 'point') {
    const anchor = labelAnchor(feature);
    // Dark ink over a light halo stays readable on every survey colour; light
    // text with a light outline disappeared on pale meadows and bare rock.
    drawLabel(ctx, feature.name, { x: anchor.x, y: anchor.y - 8 * unit }, unit, '#101820');
  }
}

function drawAreaOrLineLayers(
  ctx: CanvasRenderingContext2D,
  project: Project,
  unit: number,
  selected: Set<string>,
  labels: RenderOptions['labels'],
): void {
  for (const feature of project.features) {
    if (feature.kind === 'point') continue;
    drawFeature(ctx, feature, unit, selected.has(feature.id), labels ?? 'none');
  }
}

function drawContours(ctx: CanvasRenderingContext2D, contours: ContourLine[], unit: number): void {
  if (!contours.length) return;
  for (const line of contours) {
    if (line.coords.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = line.index ? '#8c4a1f' : '#a9764a';
    ctx.lineWidth = (line.index ? 1.6 : 0.9) * unit;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pathForRing(ctx, line.coords, line.closed);
    ctx.stroke();
    if (line.index && line.coords.length > 8 && unit < 1.2) {
      const p = line.coords[Math.floor(line.coords.length / 2)];
      drawLabel(ctx, `${line.elevation} m`, { x: p.x, y: p.y - 5 * unit }, unit, '#6b3f1d', 9);
    }
    ctx.restore();
  }
}

function drawOsm(ctx: CanvasRenderingContext2D, project: Project, unit: number): void {
  for (const way of project.osmWays) {
    if (way.coords.length < 2) continue;
    ctx.save();
    if (way.kind === 'waterway') {
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.3 * unit;
    } else if (way.highway && ['path', 'footway', 'track', 'bridleway', 'cycleway', 'steps'].includes(way.highway)) {
      ctx.strokeStyle = '#be185d';
      ctx.lineWidth = 1.2 * unit;
      ctx.setLineDash([4 * unit, 3 * unit]);
    } else {
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2 * unit;
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pathForRing(ctx, way.coords, false);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCoursePoint(
  ctx: CanvasRenderingContext2D,
  feature: Feature,
  unit: number,
  selected: boolean,
  showCode: boolean,
): void {
  const p = feature.coords[0];
  const radius = (feature.type === 'control' ? 9 : 10) * unit;
  ctx.save();
  ctx.lineWidth = 2.2 * unit;
  ctx.strokeStyle = '#7e22ce';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  if (feature.type === 'start') {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - radius * 1.15);
    ctx.lineTo(p.x + radius, p.y + radius * 0.8);
    ctx.lineTo(p.x - radius, p.y + radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (feature.type === 'finish') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 0.58, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (selected) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 6 * unit, 0, Math.PI * 2);
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.8 * unit;
    ctx.stroke();
  }
  if (showCode && feature.type === 'control' && feature.code) {
    drawLabel(ctx, feature.code, { x: p.x + radius + 10 * unit, y: p.y - radius - 2 * unit }, unit, '#581c87', 11);
  }
  ctx.restore();
  const provenance = PROVENANCE_STYLES[featureProvenance(feature)];
  ctx.save();
  ctx.strokeStyle = provenance.color;
  ctx.lineWidth = provenance.width * unit;
  if (provenance.dashed) ctx.setLineDash([4 * unit, 3 * unit]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius + 4 * unit, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (provenance.check) {
    drawProvenanceCheck(ctx, { x: p.x + radius + 7 * unit, y: p.y - radius - 7 * unit }, unit);
  }
}

function drawCourse(
  ctx: CanvasRenderingContext2D,
  project: Project,
  unit: number,
  selected: Set<string>,
  showCodes: boolean,
): void {
  const route = courseRoute(project);
  if (project.course.showLines && route.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#9333ea';
    ctx.lineWidth = 1.7 * unit;
    ctx.setLineDash([7 * unit, 4 * unit]);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    route.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }
  for (const feature of project.features) {
    if (feature.kind !== 'point' || !['start', 'control', 'finish'].includes(feature.type)) continue;
    drawCoursePoint(ctx, feature, unit, selected.has(feature.id), showCodes);
  }
}

export function drawProject(
  ctx: CanvasRenderingContext2D,
  project: Project,
  images: RenderImages,
  options: RenderOptions,
): void {
  const unit = options.unit;
  const selected = options.selected ?? new Set<string>();
  const labels = options.labels ?? 'none';
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const layerId of project.layerOrder) {
    const layer = project.layers[layerId as LayerId];
    if (!layer?.visible || layer.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    switch (layerId) {
      case 'source':
        if (images.source && project.image) {
          ctx.drawImage(images.source, 0, 0, project.image.width, project.image.height);
        }
        break;
      case 'classification':
        if (images.classification && project.image) {
          ctx.drawImage(images.classification, 0, 0, project.image.width, project.image.height);
        }
        break;
      case 'contours':
        drawContours(ctx, project.contours, unit);
        break;
      case 'osm':
        drawOsm(ctx, project, unit);
        break;
      case 'features':
        drawAreaOrLineLayers(ctx, project, unit, selected, labels);
        break;
      case 'course':
        drawCourse(ctx, project, unit, selected, options.showCourseCodes ?? true);
        break;
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  maxWidth: number,
  metersPerPixelValue: number,
  unitMeters: boolean,
): void {
  if (!Number.isFinite(metersPerPixelValue) || metersPerPixelValue <= 0) return;
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  const targetMeters = maxWidth * metersPerPixelValue;
  const meters = candidates.reduce((prev, cur) => (Math.abs(cur - targetMeters) < Math.abs(prev - targetMeters) ? cur : prev), candidates[0]);
  const width = meters / metersPerPixelValue;
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 6);
  ctx.moveTo(x + width, y - 6);
  ctx.lineTo(x + width, y + 6);
  ctx.stroke();
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(unitMeters ? `${meters} m` : `${meters} px`, x + width / 2, y - 12);
  ctx.restore();
}

export function drawNorthArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#111827';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.45, size * 0.55);
  ctx.lineTo(0, size * 0.28);
  ctx.lineTo(-size * 0.45, size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 ${size * 0.55}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -size * 1.15);
  ctx.restore();
}
