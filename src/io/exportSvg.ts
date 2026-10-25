import type { Feature, Point, Project } from '../model/types';
import type { RenderImages } from '../render/scene';
import {
  DEM_ATTRIBUTION,
  OSM_ATTRIBUTION,
  PRELIMINARY_WARNING,
  typeSpec,
} from '../model/constants';
import { metersPerPixel } from '../geo/projection';
import { courseRoute } from '../geo/projection';
import { featureProvenance } from '../render/provenance';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function num(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '0';
}

function ringPath(ring: Point[], close = true): string {
  if (!ring.length) return '';
  const parts = ring.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`);
  return parts.join(' ') + (close ? ' Z' : '');
}

function featurePath(feature: Feature): string {
  const outer = ringPath(feature.coords, true);
  const holes = (feature.holes ?? []).map((hole) => ringPath(hole, true)).join(' ');
  return `${outer} ${holes}`.trim();
}

function niceBarMeters(target: number): number {
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  return candidates.reduce((prev, cur) => (Math.abs(cur - target) < Math.abs(prev - target) ? cur : prev), candidates[0]);
}

function wrapApprox(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}

export function exportProjectSvg(project: Project, images: RenderImages): string {
  if (!project.image) throw new Error('Nessuna immagine sorgente da esportare.');
  const image = project.image;
  const mp = metersPerPixel(project);
  const pxToMm = mp ? (mp * 1000) / project.printScale : 0.1;
  const mapWmm = image.width * pxToMm;
  const mapHmm = image.height * pxToMm;
  const footerMm = 20;
  const footerPx = footerMm / pxToMm;
  const totalH = image.height + footerPx;
  const font = (mm: number) => mm / pxToMm;
  const lineUnit = font(0.18);
  const sourceSrc = images.source?.src?.startsWith('data:') ? images.source.src : '';
  const classSrc = images.classification?.src?.startsWith('data:') ? images.classification.src : '';
  const warnings = [
    PRELIMINARY_WARNING,
    project.contours.length ? DEM_ATTRIBUTION : '',
    project.osmWays.length || project.features.some((f) => f.source === 'osm') ? OSM_ATTRIBUTION : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const verified = project.features.filter((f) => f.verified).length;
  const total = project.features.length;
  const scaleLabel = mp ? `1:${project.printScale}` : 'scala non georeferenziata';

  const layerGroups: string[] = [];
  for (const layerId of project.layerOrder) {
    const layer = project.layers[layerId];
    if (!layer.visible || layer.opacity <= 0) continue;
    const opacity = ` opacity="${num(layer.opacity)}"`;
    if (layerId === 'source' && sourceSrc) {
      layerGroups.push(
        `<g${opacity}><image href="${esc(sourceSrc)}" xlink:href="${esc(sourceSrc)}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/></g>`,
      );
    } else if (layerId === 'classification' && classSrc) {
      layerGroups.push(
        `<g${opacity}><image href="${esc(classSrc)}" xlink:href="${esc(classSrc)}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/></g>`,
      );
    } else if (layerId === 'contours' && project.contours.length) {
      const paths = project.contours
        .map(
          (contour) =>
            `<path d="${ringPath(contour.coords, contour.closed)}" fill="none" stroke="${contour.index ? '#8c4a1f' : '#a9764a'}" stroke-width="${num(contour.index ? lineUnit * 1.8 : lineUnit)}" stroke-linejoin="round"/>`,
        )
        .join('');
      layerGroups.push(`<g${opacity}>${paths}</g>`);
    } else if (layerId === 'osm' && project.osmWays.length) {
      const paths = project.osmWays
        .map((way) => {
          const stroke =
            way.kind === 'waterway'
              ? '#0284c7'
              : ['path', 'footway', 'track', 'bridleway', 'cycleway', 'steps'].includes(way.highway ?? '')
                ? '#be185d'
                : '#b45309';
          const dash = ['path', 'footway', 'track', 'bridleway', 'cycleway', 'steps'].includes(way.highway ?? '')
            ? ` stroke-dasharray="${num(lineUnit * 4)} ${num(lineUnit * 3)}"`
            : '';
          return `<path d="${ringPath(way.coords, false)}" fill="none" stroke="${stroke}" stroke-width="${num(lineUnit * 1.2)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
        })
        .join('');
      layerGroups.push(`<g${opacity}>${paths}</g>`);
    } else if (layerId === 'features') {
      const parts: string[] = [];
      for (const feature of project.features) {
        if (feature.kind === 'point') continue;
        const spec = typeSpec(feature.type);
        // Dashed = automatic, solid = manual, solid + tick = verified. The same
        // neutral provenance language used by the editor is kept in the export.
        const level = featureProvenance(feature);
        const dash = level === 'auto' ? ` stroke-dasharray="${num(lineUnit * 5)} ${num(lineUnit * 3)}"` : '';
        if (feature.kind === 'area') {
          parts.push(
            `<path d="${featurePath(feature)}" fill="${spec.fill ?? spec.color}" fill-opacity="0.55" fill-rule="evenodd" stroke="${spec.color}" stroke-width="${num(lineUnit * 1.4)}" stroke-linejoin="round"${dash}/>`,
          );
        } else {
          parts.push(
            `<path d="${ringPath(feature.coords, false)}" fill="none" stroke="${spec.color}" stroke-width="${num(lineUnit * (feature.type === 'road' ? 3 : 1.8))}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`,
          );
        }
        if ((feature.source === 'manual' || feature.verified) && feature.name) {
          const p = feature.coords[Math.floor(feature.coords.length / 2)];
          parts.push(
            `<text x="${num(p.x)}" y="${num(p.y - 6)}" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-size="${num(font(2.1))}" font-weight="600" fill="${feature.verified ? '#14532d' : '#292524'}" stroke="#ffffff" stroke-width="${num(font(0.5))}" paint-order="stroke">${esc(feature.name)}${feature.verified ? ' ✓' : ''}</text>`,
          );
        }
      }
      layerGroups.push(`<g${opacity}>${parts.join('')}</g>`);
    } else if (layerId === 'course') {
      const parts: string[] = [];
      const route = courseRoute(project);
      if (project.course.showLines && route.length > 1) {
        parts.push(
          `<path d="${route.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join(' ')}" fill="none" stroke="#9333ea" stroke-width="${num(lineUnit * 1.7)}" stroke-dasharray="${num(lineUnit * 7)} ${num(lineUnit * 4)}" stroke-linejoin="round"/>`,
        );
      }
      for (const feature of project.features) {
        if (feature.kind !== 'point' || !['start', 'control', 'finish'].includes(feature.type)) continue;
        const p = feature.coords[0];
        const r = font(4.6);
        if (feature.type === 'start') {
          parts.push(
            `<path d="M${num(p.x)} ${num(p.y - r * 1.15)} L${num(p.x + r)} ${num(p.y + r * 0.8)} L${num(p.x - r)} ${num(p.y + r * 0.8)} Z" fill="#ffffff" fill-opacity="0.92" stroke="#7e22ce" stroke-width="${num(lineUnit * 2.1)}"/>`,
          );
        } else if (feature.type === 'finish') {
          parts.push(
            `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="${num(r)}" fill="none" stroke="#7e22ce" stroke-width="${num(lineUnit * 2.1)}"/><circle cx="${num(p.x)}" cy="${num(p.y)}" r="${num(r * 0.58)}" fill="none" stroke="#7e22ce" stroke-width="${num(lineUnit * 2.1)}"/>`,
          );
        } else {
          parts.push(
            `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="${num(r)}" fill="#ffffff" fill-opacity="0.92" stroke="#7e22ce" stroke-width="${num(lineUnit * 2.1)}"/>`,
          );
          if (feature.code) {
            parts.push(
              `<text x="${num(p.x + r + font(2))}" y="${num(p.y - r)}" font-family="Segoe UI, system-ui, sans-serif" font-size="${num(font(2.6))}" font-weight="700" fill="#581c87" stroke="#ffffff" stroke-width="${num(font(0.5))}" paint-order="stroke">${esc(feature.code)}</text>`,
            );
          }
        }
        if (!feature.verified) {
          parts.push(
            `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="${num(r + font(1))}" fill="none" stroke="#b45309" stroke-width="${num(lineUnit)}" stroke-dasharray="${num(lineUnit * 3)} ${num(lineUnit * 2)}"/>`,
          );
        }
      }
      layerGroups.push(`<g${opacity}>${parts.join('')}</g>`);
    }
  }

  // Scale bar inside map
  let scaleBar = '';
  if (mp) {
    const maxMeters = (image.width * 0.25) * mp;
    const meters = niceBarMeters(maxMeters);
    const barPx = meters / mp;
    const x = 16;
    const y = image.height - 16;
    scaleBar = `<g stroke="#111827" stroke-width="${num(lineUnit * 2)}" fill="#111827">
      <line x1="${x}" y1="${y}" x2="${num(x + barPx)}" y2="${y}"/>
      <line x1="${x}" y1="${num(y - 5)}" x2="${x}" y2="${num(y + 5)}"/>
      <line x1="${num(x + barPx)}" y1="${num(y - 5)}" x2="${num(x + barPx)}" y2="${num(y + 5)}"/>
      <text x="${num(x + barPx / 2)}" y="${num(y - 6)}" text-anchor="middle" stroke="none" font-family="Segoe UI, system-ui, sans-serif" font-size="${num(font(2.6))}" font-weight="700">${meters} m</text>
    </g>`;
  }
  const north = project.showNorth
    ? `<g transform="translate(${image.width - 32} 32)" fill="#111827" stroke="#111827" stroke-width="${num(lineUnit * 2)}">
        <path d="M0 -14 L6 8 L0 4 L-6 8 Z"/>
        <text x="0" y="-18" text-anchor="middle" stroke="none" font-family="Segoe UI, system-ui, sans-serif" font-size="${num(font(2.8))}" font-weight="700">N</text>
      </g>`
    : '';

  const footerY = image.height + font(2.8);
  const warningLines = wrapApprox(warnings, Math.max(48, Math.floor(mapWmm / 1.55)));
  const footerLines = warningLines
    .map((line, i) => `<text x="0" y="${num(footerY + font(2.2) * (i + 1))}">${esc(line)}</text>`)
    .join('');
  const metadata = {
    schema: project.schema,
    name: project.name,
    exportedAt: new Date().toISOString(),
    printScale: project.printScale,
    metersPerPixel: mp,
    georeferenced: Boolean(project.imageBBox),
    georeferenceSource: project.projectionSource,
    imageBBox: project.imageBBox,
    disclaimer: PRELIMINARY_WARNING,
    verifiedFeatures: verified,
    totalFeatures: total,
    osmAttribution: project.osmWays.length || project.features.some((f) => f.source === 'osm') ? OSM_ATTRIBUTION : null,
    demAttribution: project.contours.length ? DEM_ATTRIBUTION : null,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${num(mapWmm)}mm" height="${num(mapHmm + footerMm)}mm" viewBox="0 0 ${image.width} ${num(totalH)}">
  <title>${esc(project.name)} — Terrain / O</title>
  <desc>${esc(PRELIMINARY_WARNING)}</desc>
  <metadata>${esc(JSON.stringify(metadata))}</metadata>
  <defs>
    <clipPath id="mapClip"><rect x="0" y="0" width="${image.width}" height="${image.height}"/></clipPath>
    <style>
      text { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; }
    </style>
  </defs>
  <rect x="0" y="0" width="${image.width}" height="${num(totalH)}" fill="#ffffff"/>
  <g clip-path="url(#mapClip)">
    ${layerGroups.join('\n    ')}
    ${scaleBar}
    ${north}
  </g>
  <rect x="0.5" y="0.5" width="${image.width - 1}" height="${image.height - 1}" fill="none" stroke="#27362e" stroke-width="${num(lineUnit)}"/>
  <g transform="translate(0 ${image.height})" fill="#3f4a44" font-size="${num(font(2.05))}">
    <rect x="0" y="0" width="${image.width}" height="${num(footerPx)}" fill="#f6f1e6"/>
    <text x="0" y="${num(font(4.6))}" font-size="${num(font(3.3))}" font-weight="700" fill="#17231d">${esc(project.name)}</text>
    <text x="${image.width}" y="${num(font(4.2))}" text-anchor="end" font-size="${num(font(2.4))}" font-weight="700" fill="#7c3a00">BOZZA PRELIMINARE · ${scaleLabel}</text>
    ${footerLines}
    <text x="0" y="${num(font(2.2) * (warningLines.length + 3.6))}" fill="#5b665f" font-size="${num(font(1.8))}">Elementi ${total} · verificati ${verified} · non verificati ${total - verified} · generato ${new Date().toLocaleDateString('it-IT')}</text>
  </g>
</svg>`;
}
