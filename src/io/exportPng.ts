import type { Project } from '../model/types';
import type { RenderImages } from '../render/scene';
import { drawNorthArrow, drawProject, drawScaleBar } from '../render/scene';
import { createCanvas, get2d } from '../render/canvas';
import {
  DEM_ATTRIBUTION,
  OSM_ATTRIBUTION,
  PRELIMINARY_WARNING,
  typeSpec,
} from '../model/constants';
import { featureAreaMeters, featureLengthMeters, metersPerPixel } from '../geo/projection';

export interface MapRenderResult {
  canvas: HTMLCanvasElement;
  multiplier: number;
  capped: boolean;
}

const MAX_EXPORT_SIDE = 9000;
const MAX_EXPORT_PIXELS = 70_000_000;

export function renderMapCanvas(
  project: Project,
  images: RenderImages,
  requestedMultiplier = 1,
): MapRenderResult {
  if (!project.image) throw new Error('Nessuna immagine sorgente da esportare.');
  let multiplier = Math.max(0.25, requestedMultiplier);
  const longest = Math.max(project.image.width, project.image.height);
  let capped = false;
  if (longest * multiplier > MAX_EXPORT_SIDE) {
    multiplier = MAX_EXPORT_SIDE / longest;
    capped = true;
  }
  if (project.image.width * multiplier * (project.image.height * multiplier) > MAX_EXPORT_PIXELS) {
    multiplier = Math.sqrt(MAX_EXPORT_PIXELS / (project.image.width * project.image.height));
    capped = true;
  }
  const width = Math.max(1, Math.round(project.image.width * multiplier));
  const height = Math.max(1, Math.round(project.image.height * multiplier));
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.scale(width / project.image.width, height / project.image.height);
  drawProject(ctx, project, images, {
    unit: project.image.width / width,
    labels: 'important',
    showCourseCodes: true,
  });
  ctx.restore();
  return { canvas, multiplier, capped };
}

export interface PngComposeOptions {
  multiplier?: number;
  includeChrome?: boolean;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function describeFeature(feature: Project['features'][number], project: Project): string {
  if (feature.kind === 'area') {
    const area = featureAreaMeters(project, feature);
    return area == null ? 'area' : `${area < 10000 ? Math.round(area) + ' m²' : (area / 10000).toFixed(2) + ' ha'}`;
  }
  const length = featureLengthMeters(project, feature);
  if (length == null) return feature.kind === 'point' ? 'punto' : 'linea';
  return length < 1000 ? `${length.toFixed(0)} m` : `${(length / 1000).toFixed(2)} km`;
}

export function composeProjectPng(project: Project, images: RenderImages, options: PngComposeOptions = {}): HTMLCanvasElement {
  const { canvas: mapCanvas, multiplier, capped } = renderMapCanvas(project, images, options.multiplier ?? 1);
  const includeChrome = options.includeChrome !== false;
  const mp = metersPerPixel(project);
  if (!includeChrome) return mapCanvas;

  const pad = Math.max(24, Math.round(36 * Math.min(1.5, multiplier)));
  const header = Math.round(86 * Math.min(1.5, multiplier));
  const footer = Math.round(150 * Math.min(1.5, multiplier));
  const width = mapCanvas.width + pad * 2;
  const height = header + mapCanvas.height + footer;
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad, header, mapCanvas.width, mapCanvas.height);
  ctx.drawImage(mapCanvas, pad, header);

  ctx.strokeStyle = '#27362e';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad + 0.5, header + 0.5, mapCanvas.width - 1, mapCanvas.height - 1);

  ctx.fillStyle = '#17231d';
  ctx.font = `700 ${Math.round(24 * Math.min(1.5, multiplier))}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(project.name, pad, Math.round(38 * Math.min(1.5, multiplier)));
  ctx.font = `500 ${Math.round(13 * Math.min(1.5, multiplier))}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = '#4d5c54';
  const scaleLabel = mp
    ? `Scala di stampa 1:${project.printScale} · risoluzione ${mp.toFixed(2)} m/px · ${project.image?.width}×${project.image?.height} px`
    : 'Scala non georeferenziata: misura in pixel';
  ctx.fillText(scaleLabel, pad, Math.round(60 * Math.min(1.5, multiplier)));

  ctx.textAlign = 'right';
  ctx.fillStyle = '#7c3a00';
  ctx.font = `800 ${Math.round(15 * Math.min(1.5, multiplier))}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText('BOZZA PRELIMINARE — NON ATTA ALLA GARA', width - pad, Math.round(38 * Math.min(1.5, multiplier)));

  if (mp) {
    const maxBar = Math.min(mapCanvas.width * 0.34, 280 * multiplier);
    ctx.save();
    ctx.translate(pad + 22, header + mapCanvas.height - 30);
    drawScaleBar(ctx, 0, 0, maxBar, mp / multiplier, false);
    ctx.restore();
  }

  if (project.showNorth) {
    drawNorthArrow(ctx, pad + mapCanvas.width - 42, header + 52, 18 * Math.min(1.5, multiplier));
  }

  let y = header + mapCanvas.height + Math.round(24 * Math.min(1.5, multiplier));
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5c2c00';
  ctx.font = `700 ${Math.round(11.5 * Math.min(1.5, multiplier))}px "Segoe UI", system-ui, sans-serif`;
  const warningLines = wrapText(ctx, PRELIMINARY_WARNING, width - pad * 2);
  for (const line of warningLines) {
    ctx.fillText(line, pad, y);
    y += Math.round(15 * Math.min(1.5, multiplier));
  }
  y += Math.round(4 * Math.min(1.5, multiplier));

  const counts = project.features.reduce(
    (acc, feature) => {
      acc.total++;
      if (feature.verified) acc.verified++;
      if (feature.source === 'vector' || feature.source === 'osm') acc.auto++;
      return acc;
    },
    { total: 0, verified: 0, auto: 0 },
  );
  ctx.fillStyle = '#334139';
  ctx.font = `500 ${Math.round(11 * Math.min(1.5, multiplier))}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(
    `Elementi: ${counts.total} · verificati: ${counts.verified} · non verificati: ${counts.total - counts.verified} · da interpretazione automatica: ${counts.auto}`,
    pad,
    y,
  );
  y += Math.round(17 * Math.min(1.5, multiplier));

  const presentTypes = [...new Set(project.features.filter((f) => f.kind !== 'point').map((f) => f.type))].slice(0, 7);
  let x = pad;
  for (const type of presentTypes) {
    const spec = typeSpec(type);
    ctx.fillStyle = spec.fill ?? spec.color;
    ctx.fillRect(x, y - 9, 14, 10);
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - 9, 14, 10);
    ctx.fillStyle = '#334139';
    ctx.fillText(spec.label, x + 20, y);
    x += 20 + ctx.measureText(spec.label).width + 18;
    if (x > width - pad - 120) break;
  }
  y += Math.round(18 * Math.min(1.5, multiplier));

  const attribution: string[] = [];
  if (project.osmWays.length || project.features.some((f) => f.source === 'osm')) attribution.push(OSM_ATTRIBUTION);
  if (project.contours.length) attribution.push(DEM_ATTRIBUTION);
  ctx.fillStyle = '#5b665f';
  ctx.font = `500 ${Math.round(10.5 * Math.min(1.5, multiplier))}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(
    `${attribution.join(' · ') || 'Nessun dato OSM/DEM esportato'} · ${new Date().toLocaleDateString('it-IT')}${capped ? ' · risoluzione limitata per memoria' : ''}`,
    pad,
    y,
  );
  y += Math.round(14 * Math.min(1.5, multiplier));
  ctx.fillText(
    'Percorribilità, vegetazione sotto copertura, sicurezza, quota e conformità IOF non sono dichiarate. Verificare sul campo.',
    pad,
    y,
  );
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Esportazione PNG non riuscita.'))), type, quality);
  });
}

export function projectLegend(project: Project): Array<{ label: string; color: string; count: number }> {
  const counts = new Map<string, number>();
  for (const feature of project.features) {
    if (feature.kind === 'point') continue;
    counts.set(feature.type, (counts.get(feature.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => {
    const spec = typeSpec(type);
    return { label: spec.label, color: spec.fill ?? spec.color, count };
  });
}

export function mapSummary(project: Project): string {
  return project.features
    .filter((f) => f.kind !== 'point')
    .slice(0, 8)
    .map((f) => `${typeSpec(f.type).label}: ${describeFeature(f, project)}`)
    .join(' · ');
}
