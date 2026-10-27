import proj4 from 'proj4';
import type { Feature, Point, Project } from '../model/types';
import type { RenderImages } from '../render/scene';
import {
  APP_VERSION,
  DEM_ATTRIBUTION,
  OSM_ATTRIBUTION,
  PRELIMINARY_WARNING,
} from '../model/constants';
import { metersPerPixel, pixelToWgs84 } from '../geo/projection';
import { pixelToWorld, worldFileUnits } from '../geo/worldfile';
import { assertProjectTopology } from './topologyCheck';
import type { MapStandard } from '../model/types';
import { exportSymbolCodes, projectStandard } from '../model/mapSymbols';
import {
  ISOM_SYMBOL_SET,
  ISSPROM_SYMBOL_SET,
  type OmapSymbolDefinition,
  type OmapSymbolSet,
} from './omapSymbolSets';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round(value: number): number {
  return Math.round(value);
}

const OMAP_SETS: Record<MapStandard, OmapSymbolSet> = {
  isom: ISOM_SYMBOL_SET,
  issprom: ISSPROM_SYMBOL_SET,
};

const OMAP_BY_CODE: Record<MapStandard, Map<string, OmapSymbolDefinition>> = {
  isom: new Map(ISOM_SYMBOL_SET.symbols.map((symbol) => [symbol.code, symbol])),
  issprom: new Map(ISSPROM_SYMBOL_SET.symbols.map((symbol) => [symbol.code, symbol])),
};

function symbolDefinition(standard: MapStandard, code: string): OmapSymbolDefinition {
  const symbol = OMAP_BY_CODE[standard].get(code);
  if (!symbol) throw new Error(`Simbolo ${code} assente nel set ${OMAP_SETS[standard].label}.`);
  return symbol;
}

function objectTags(feature: Feature, code?: string, role?: string): string {
  const tags = [
    `<t k="terrain-o:stato">${feature.verified ? 'verificato' : 'non verificato'}</t>`,
    `<t k="terrain-o:fonte">${esc(feature.source ?? 'manual')}</t>`,
    code ? `<t k="terrain-o:simbolo">${esc(code)}</t>` : '',
    role ? `<t k="terrain-o:ruolo">${esc(role)}</t>` : '',
    feature.name ? `<t k="terrain-o:nome">${esc(feature.name)}</t>` : '',
    feature.notes ? `<t k="terrain-o:nota">${esc(feature.notes)}</t>` : '',
    feature.verifiedNote ? `<t k="terrain-o:nota-verifica">${esc(feature.verifiedNote)}</t>` : '',
    feature.osmId != null ? `<t k="terrain-o:osm-id">${feature.osmId}</t>` : '',
  ]
    .filter(Boolean)
    .join('');
  return `<tags>${tags}</tags>`;
}

interface ParsedProjection {
  projName?: string;
  datumCode?: string;
  ellps?: string;
  units?: string;
  to_meter?: number;
  lat0?: number;
  long0?: number;
  k0?: number;
  x0?: number;
  y0?: number;
  lat1?: number;
  lat2?: number;
  srsCode?: string;
}

const PROJ_NAMES: Record<string, string> = {
  Transverse_Mercator: 'tmerc',
  Gauss_Kruger: 'tmerc',
  Lambert_Conformal_Conic_2SP: 'lcc',
  Lambert_Conformal_Conic: 'lcc',
  Albers_Conic_Equal_Area: 'aea',
  Mercator_1SP: 'merc',
  Mercator_2SP: 'merc',
  Polar_Stereographic: 'stere',
  Stereographic: 'stere',
  Equidistant_Cylindrical: 'eqc',
  Cassini_Soldner: 'cass',
  Polyconic: 'poly',
  Azimuthal_Equidistant: 'aeqd',
};

function degrees(radians: number | undefined): number | null {
  return typeof radians === 'number' && Number.isFinite(radians) ? (radians * 180) / Math.PI : null;
}

function numberText(value: number): string {
  return Number(value.toPrecision(12)).toString();
}

/**
 * OOM stores CRS definitions as PROJ.4 strings, not WKT. proj4 can parse the
 * input WKT, and its Proj object exposes the parameters needed to rebuild the
 * equivalent PROJ.4 definition for the common projected CRSs found in .prj
 * files. Unsupported projections fall back to a local CRS plus WGS84 reference.
 */
function proj4SpecFromWkt(wkt: string | null): { spec: string | null; code: string | null } {
  if (!wkt) return { spec: null, code: null };
  const epsgMatches = [...wkt.matchAll(/AUTHORITY\[\s*"EPSG"\s*,\s*"(\d+)"\s*\]/g)];
  const epsg = epsgMatches.length ? epsgMatches[epsgMatches.length - 1][1] : null;
  try {
    const parsed = proj4.Proj(wkt) as unknown as ParsedProjection;
    const projName = parsed.projName ? PROJ_NAMES[parsed.projName] : undefined;
    if (!projName) return { spec: null, code: epsg ? `EPSG:${epsg}` : null };
    const parts = [`+proj=${projName}`];
    const lat0 = degrees(parsed.lat0);
    const lon0 = degrees(parsed.long0);
    if (lat0 != null && Math.abs(lat0) > 1e-12) parts.push(`+lat_0=${numberText(lat0)}`);
    if (lon0 != null) parts.push(`+lon_0=${numberText(lon0)}`);
    const lat1 = degrees(parsed.lat1);
    const lat2 = degrees(parsed.lat2);
    if (lat1 != null && projName === 'lcc') parts.push(`+lat_1=${numberText(lat1)}`);
    if (lat2 != null && projName === 'lcc') parts.push(`+lat_2=${numberText(lat2)}`);
    if (typeof parsed.k0 === 'number' && Math.abs(parsed.k0 - 1) > 1e-12) parts.push(`+k_0=${numberText(parsed.k0)}`);
    if (typeof parsed.x0 === 'number' && parsed.x0 !== 0) parts.push(`+x_0=${numberText(parsed.x0)}`);
    if (typeof parsed.y0 === 'number' && parsed.y0 !== 0) parts.push(`+y_0=${numberText(parsed.y0)}`);
    if (parsed.datumCode && parsed.datumCode !== 'none') parts.push(`+datum=${parsed.datumCode}`);
    else if (parsed.ellps) parts.push(`+ellps=${parsed.ellps}`);
    if (Math.abs((parsed.to_meter ?? 1) - 1) < 1e-12) parts.push('+units=m');
    else if (parsed.to_meter) parts.push(`+to_meter=${numberText(parsed.to_meter)}`);
    parts.push('+no_defs');
    return { spec: parts.join(' '), code: epsg ? `EPSG:${epsg}` : parsed.srsCode ?? 'Custom' };
  } catch {
    return { spec: null, code: epsg ? `EPSG:${epsg}` : null };
  }
}

function buildGeoreferencing(project: Project): string {
  const scale = project.printScale;
  if (!project.worldFile || !project.image || project.projectionSource === 'none') {
    return `<georeferencing scale="${scale}"><projected_crs id="Local"/></georeferencing>`;
  }
  // OOM map coordinates have their origin at the map reference point and grow
  // right/down, exactly like image pixel coordinates. The reference point must
  // therefore be the top-left corner of the source image, not the bottom-left.
  const topLeft = pixelToWorld(project.worldFile, 0, 0);
  const units = worldFileUnits(project.worldFile);
  const epsg = proj4SpecFromWkt(project.projectionWKT);
  const geo = pixelToWgs84(project, { x: 0, y: 0 });
  const refPoint = `<ref_point x="0" y="0"/>`;
  const crsParts: string[] = [];
  if (units === 'degrees') {
    // A WGS84 world file is already geographic: OOM accepts a geographic CRS
    // in the projected_crs slot and keeps the map georeferenced without a
    // metric projection. Writing "Local" here silently dropped georeferencing.
    crsParts.push(
      `<projected_crs id="Geographic coordinates"><spec language="PROJ.4">+proj=longlat +datum=WGS84 +no_defs</spec><ref_point x="${topLeft.x.toFixed(8)}" y="${topLeft.y.toFixed(8)}"/></projected_crs>`,
    );
  } else if (epsg.spec) {
    crsParts.push(
      `<projected_crs id="${esc(epsg.code ?? 'Local')}"><spec language="PROJ.4">${esc(epsg.spec)}</spec><ref_point x="${topLeft.x.toFixed(6)}" y="${topLeft.y.toFixed(6)}"/></projected_crs>`,
    );
  } else {
    crsParts.push('<projected_crs id="Local"/>');
  }
  if (geo) {
    crsParts.push(
      `<geographic_crs id="WGS 84"><spec language="PROJ.4">+proj=latlong +datum=WGS84</spec><ref_point_deg lat="${geo[1].toFixed(8)}" lon="${geo[0].toFixed(8)}"/></geographic_crs>`,
    );
  }
  return `<georeferencing scale="${scale}">${refPoint}${crsParts.join('')}</georeferencing>`;
}

interface BuildContext {
  unitsPerPixel: number;
}

function coordText(point: Point, ctx: BuildContext, flag?: number): string {
  // Native OOM units are 1/1000 mm. OOM map coordinates grow right and down,
  // exactly like image pixel coordinates; the georeferencing transform flips
  // only the projected northing (see Georeferencing::updateTransformation in
  // the OOM sources). Keeping image y positive is what prevents the exported
  // map from appearing vertically mirrored.
  const x = round(point.x * ctx.unitsPerPixel);
  const y = round(point.y * ctx.unitsPerPixel);
  return `${x} ${y}${flag ? ` ${flag}` : ''};`;
}

/**
 * OOM path flags: 2 = closed path, 16 = hole point. The outline must only be
 * closed; only inner rings carry the hole flag. Marking the outline as a hole
 * made the fill and the geometry unreliable in Mapper.
 */
const FLAG_CLOSE = 2;
const FLAG_CLOSE_HOLE = 18;

function ringCoords(ring: Point[], ctx: BuildContext, closeFlag = FLAG_CLOSE): string {
  if (!ring.length) return '';
  const body = ring.map((point) => coordText(point, ctx)).join('');
  return `${body}${coordText(ring[0], ctx, closeFlag)}`;
}

function objectXmls(feature: Feature, ctx: BuildContext, standard: MapStandard): string[] {
  if (!feature.coords.length) return [];
  const codes = exportSymbolCodes(feature.type, standard);
  if (!codes.length) return [];
  const primary = symbolDefinition(standard, codes[0]);
  const tags = objectTags(feature, codes[0]);

  if (feature.kind === 'area') {
    const rings = [feature.coords, ...(feature.holes ?? [])];
    const coords = rings
      .map((ring, index) => ringCoords(ring, ctx, index === 0 ? FLAG_CLOSE : FLAG_CLOSE_HOLE))
      .join('');
    const count = rings.reduce((sum, ring) => sum + ring.length + 1, 0);
    const objects = [
      `<object type="1" symbol="${primary.id}">${tags}<coords count="${count}">${coords}</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object>`,
    ];
    // Water, paved areas and sprint buildings are combined symbols in OOM.
    // We keep the fill and the edge as two independent objects so the fill can
    // carry holes without making the outline a hole as well.
    for (const code of codes.slice(1)) {
      const companion = symbolDefinition(standard, code);
      for (const ring of rings) {
        if (ring.length < 2) continue;
        const ringTags = objectTags(feature, code, 'contorno');
        objects.push(
          `<object type="1" symbol="${companion.id}">${ringTags}<coords count="${ring.length + 1}">${ringCoords(ring, ctx, FLAG_CLOSE)}</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object>`,
        );
      }
    }
    return objects;
  }

  if (feature.kind === 'line') {
    const coords = feature.coords.map((point) => coordText(point, ctx)).join('');
    return [
      `<object type="1" symbol="${primary.id}">${tags}<coords count="${feature.coords.length}">${coords}</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object>`,
    ];
  }

  return [
    `<object type="0" symbol="${primary.id}">${tags}<coords count="1">${coordText(feature.coords[0], ctx)}</coords></object>`,
  ];
}

function contourObjects(project: Project, ctx: BuildContext, standard: MapStandard): string[] {
  return project.contours
    .filter((contour) => contour.coords.length >= 2)
    .map((contour) => {
      const coords = contour.closed
        ? `${contour.coords.map((p) => coordText(p, ctx)).join('')}${coordText(contour.coords[0], ctx, FLAG_CLOSE)}`
        : contour.coords.map((p) => coordText(p, ctx)).join('');
      const count = contour.coords.length + (contour.closed ? 1 : 0);
      const symbol = symbolDefinition(standard, contour.index ? '102' : '101');
      const tags = `<tags><t k="terrain-o:fonte">dem</t><t k="terrain-o:simbolo">${contour.index ? '102' : '101'}</t><t k="terrain-o:stato">non verificato</t></tags>`;
      return `<object type="1" symbol="${symbol.id}">${tags}<coords count="${count}">${coords}</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object>`;
    });
}

function controlLabels(project: Project, ctx: BuildContext, standard: MapStandard): string[] {
  const symbol = symbolDefinition(standard, '704');
  const labels: string[] = [];
  for (const feature of project.features) {
    if (feature.type !== 'control' || !feature.code) continue;
    const x = round(feature.coords[0].x * ctx.unitsPerPixel + 5000);
    const y = round(feature.coords[0].y * ctx.unitsPerPixel + 1500);
    labels.push(
      `<object type="4" symbol="${symbol.id}" h_align="0" v_align="2"><coords count="1">${x} ${y};</coords><text>${esc(feature.code)}</text></object>`,
    );
  }
  return labels;
}

export function exportProjectOmap(project: Project, _images?: RenderImages): string {
  if (!project.image) throw new Error('Nessuna immagine sorgente da esportare in OMAP.');
  assertProjectTopology(project, 'OMAP');
  const mp = metersPerPixel(project);
  const mmPerPixel = mp ? (mp * 1000) / project.printScale : 0.1;
  const ctx: BuildContext = { unitsPerPixel: mmPerPixel * 1000 };
  const standard = projectStandard(project);
  const symbolSet = OMAP_SETS[standard];
  const featureObjects = project.features.flatMap((feature) => objectXmls(feature, ctx, standard));
  const contourObj = contourObjects(project, ctx, standard);
  const labels = controlLabels(project, ctx, standard);
  const allObjects = [...featureObjects, ...contourObj, ...labels];
  const verified = project.features.filter((feature) => feature.verified).length;
  const attribution: string[] = [];
  if (project.osmWays.length || project.features.some((f) => f.source === 'osm')) attribution.push(OSM_ATTRIBUTION);
  if (project.contours.length) attribution.push(DEM_ATTRIBUTION);
  const notes = [
    PRELIMINARY_WARNING,
    `Progetto: ${project.name}`,
    `Generato da Terrain / O v${APP_VERSION} il ${new Date().toISOString()}`,
    `Immagine: ${project.image.name} (${project.image.width}×${project.image.height} px)`,
    'Coordinate OOM: origine nel punto di riferimento (angolo superiore sinistro), x verso destra e y verso il basso, come i pixel dell’immagine.',
    mp
      ? `Scala di stampa dichiarata: 1:${project.printScale}; risoluzione ${mp.toFixed(2)} m/px.`
      : 'Scala non georeferenziata: dimensioni di stampa convenzionali (0,1 mm per pixel).',
    `Elementi: ${project.features.length}; verificati sul campo: ${verified}; non verificati: ${project.features.length - verified}.`,
    'Gli elementi automatici (OSM, classificazione, DEM) sono sperimentali e non verificati.',
    attribution.length ? attribution.join(' · ') : '',
    `Standard simboli: ${symbolSet.label}; definizioni ufficiali OpenOrienteering Mapper (${symbolSet.symbols.length} simboli inclusi).`,
    'Apertura prevista in OpenOrienteering Mapper 0.9.x; l’apertura e la resa dei simboli vanno verificate manualmente prima dell’uso.',
    project.imageBBox
      ? `Georeferenziazione: ${project.projectionSource}; bbox WGS84 ${project.imageBBox.west.toFixed(6)}, ${project.imageBBox.south.toFixed(6)} – ${project.imageBBox.east.toFixed(6)}, ${project.imageBBox.north.toFixed(6)}.`
      : 'Georeferenziazione assente: coordinate locali.',
  ]
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="9">
<notes>${esc(notes)}</notes>
${buildGeoreferencing(project)}
${symbolSet.colors}
<barrier version="6" required="0.6.0">
<symbols count="${symbolSet.symbols.length}" id="Terrain / O — ${esc(symbolSet.label)}">
${symbolSet.symbols.map((symbol) => symbol.xml).join('\n')}
</symbols>
<parts count="1" current="0">
<part name="Bozza preliminare"><objects count="${allObjects.length}">
${allObjects.join('\n')}
</objects></part>
</parts>
<templates count="0" first_front_template="0">
<defaults use_meters_per_pixel="true" meters_per_pixel="0" dpi="0" scale="0"/>
</templates>
<view>
<grid color="#646464" display="0" alignment="0" additional_rotation="0" unit="1" h_spacing="500" v_spacing="500" h_offset="0" v_offset="0" snapping_enabled="true"/>
</view>
</barrier>
</map>
`;
}

export function omapDebugInfo(project: Project): {
  unitsPerPixel: number;
  symbolCount: number;
  objectCount: number;
  typeCounts: Record<string, number>;
} {
  if (!project.image) throw new Error('Nessuna immagine.');
  const mp = metersPerPixel(project);
  const mmPerPixel = mp ? (mp * 1000) / project.printScale : 0.1;
  const standard = projectStandard(project);
  return {
    unitsPerPixel: mmPerPixel * 1000,
    symbolCount: OMAP_SETS[standard].symbols.length,
    objectCount: project.features.length,
    typeCounts: project.features.reduce<Record<string, number>>((acc, feature) => {
      acc[feature.type] = (acc[feature.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
