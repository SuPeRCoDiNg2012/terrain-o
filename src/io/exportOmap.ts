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

const SYMBOL_IDS = {
  water: 0,
  open: 1,
  vegetation: 2,
  building: 3,
  artificial: 4,
  road: 5,
  path: 6,
  stream: 7,
  fence: 8,
  start: 9,
  control: 10,
  finish: 11,
  controlNumber: 12,
  contour: 13,
  indexContour: 14,
} as const;

const AREA_SYMBOL: Record<string, number> = {
  forest: SYMBOL_IDS.vegetation,
  thicket: SYMBOL_IDS.vegetation,
  open: SYMBOL_IDS.open,
  water: SYMBOL_IDS.water,
  building: SYMBOL_IDS.building,
  artificial: SYMBOL_IDS.artificial,
};

const LINE_SYMBOL: Record<string, number> = {
  path: SYMBOL_IDS.path,
  road: SYMBOL_IDS.road,
  stream: SYMBOL_IDS.stream,
  fence: SYMBOL_IDS.fence,
};

const POINT_SYMBOL: Record<string, number> = {
  start: SYMBOL_IDS.start,
  control: SYMBOL_IDS.control,
  finish: SYMBOL_IDS.finish,
};

const COLORS = [
  { name: 'Nero', c: 0, m: 0, y: 0, k: 1, r: 0, g: 0, b: 0, spot: '<namedcolor>BLACK</namedcolor>' },
  { name: 'Verde vegetazione', c: 0.62, m: 0, y: 0.86, k: 0.2, r: 0.18, g: 0.49, b: 0.2, spot: '<namedcolor>GREEN</namedcolor>' },
  { name: 'Giallo terreno aperto', c: 0, m: 0.15, y: 0.68, k: 0.1, r: 0.91, g: 0.78, b: 0.3, spot: '<namedcolor>YELLOW</namedcolor>' },
  { name: 'Blu acqua', c: 0.76, m: 0.38, y: 0, k: 0.31, r: 0.17, g: 0.42, b: 0.69, spot: '<namedcolor>BLUE</namedcolor>' },
  { name: 'Marrone curve', c: 0, m: 0.36, y: 0.69, k: 0.45, r: 0.55, g: 0.35, b: 0.17, spot: '<namedcolor>BROWN</namedcolor>' },
  { name: 'Viola percorso', c: 0.39, m: 0.83, y: 0, k: 0.19, r: 0.49, g: 0.13, b: 0.81, spot: '<namedcolor>PURPLE</namedcolor>' },
  { name: 'Grigio edifici', c: 0, m: 0, y: 0, k: 0.42, r: 0.58, g: 0.58, b: 0.58, spot: '<component factor="0.42" spotcolor="0"/>' },
  { name: 'Bianco', c: 0, m: 0, y: 0, k: 0, r: 1, g: 1, b: 1, spot: '<component factor="0" spotcolor="0"/>' },
];

function lineSymbol(params: {
  color: number;
  width: number;
  dashed?: boolean;
  minimumLength?: number;
  dashLength?: number;
  breakLength?: number;
  borders?: boolean;
}): string {
  const dashed = params.dashed ? ' dashed="true"' : '';
  const borders = params.borders
    ? '<borders><border color="0" width="120" shift="60"/></borders>'
    : '';
  return `<line_symbol color="${params.color}" line_width="${params.width}" minimum_length="${params.minimumLength ?? 0}" join_style="1" cap_style="0" start_offset="0" end_offset="0"${dashed} segment_length="4000" end_length="0" show_at_least_one_symbol="true" minimum_mid_symbol_count="0" minimum_mid_symbol_count_when_closed="0" dash_length="${params.dashLength ?? 4000}" break_length="${params.breakLength ?? 1000}" dashes_in_group="1" in_group_break_length="500" mid_symbols_per_spot="1" mid_symbol_distance="0">${borders}</line_symbol>`;
}

function symbolDefinitions(): string {
  return [
    `<symbol type="4" id="0" code="301" name="Acqua"><description>Area acquea. Bozza preliminare, non verificata automaticamente.</description><area_symbol inner_color="3" min_area="0" patterns="0"/></symbol>`,
    `<symbol type="4" id="1" code="310" name="Terreno aperto"><description>Terreno aperto indicativo.</description><area_symbol inner_color="2" min_area="0" patterns="0"/></symbol>`,
    `<symbol type="4" id="2" code="410" name="Vegetazione fitta"><description>Vegetazione: simbolo ISOM 410. La percorribilità non è dichiarata.</description><area_symbol inner_color="1" min_area="0" patterns="0"/></symbol>`,
    `<symbol type="4" id="3" code="521" name="Edificio"><description>Edificio.</description><area_symbol inner_color="6" min_area="0" patterns="0"/></symbol>`,
    `<symbol type="4" id="4" code="501" name="Superficie artificiale"><description>Superficie pavimentata o artificiale.</description><area_symbol inner_color="6" min_area="0" patterns="0"/></symbol>`,
    `<symbol type="2" id="5" code="502" name="Strada"><description>Strada. Simbolo semplificato.</description>${lineSymbol({ color: 0, width: 300, borders: true })}</symbol>`,
    `<symbol type="2" id="6" code="505" name="Sentiero"><description>Sentiero. Simbolo semplificato.</description>${lineSymbol({ color: 0, width: 140, dashed: true, dashLength: 2000, breakLength: 800 })}</symbol>`,
    `<symbol type="2" id="7" code="304" name="Ruscello"><description>Corso d'acqua attraversabile.</description>${lineSymbol({ color: 3, width: 160 })}</symbol>`,
    `<symbol type="2" id="8" code="516" name="Recinzione"><description>Recinzione.</description>${lineSymbol({ color: 0, width: 100, dashed: true, dashLength: 1200, breakLength: 500 })}</symbol>`,
    `<symbol type="1" id="9" code="701" name="Partenza"><point_symbol rotatable="true" inner_radius="2000" inner_color="-1" outer_width="0" outer_color="-1" elements="1"><element><symbol type="2" code=""><line_symbol color="5" line_width="350" minimum_length="0" join_style="1" cap_style="0" start_offset="0" end_offset="0" segment_length="3429" end_length="0" show_at_least_one_symbol="true" minimum_mid_symbol_count="0" minimum_mid_symbol_count_when_closed="0" dash_length="3429" break_length="857" dashes_in_group="1" in_group_break_length="429" mid_symbols_per_spot="1" mid_symbol_distance="0"/></symbol><object type="1"><coords count="4">-2697 1557;0 -3114;2697 1557;-2697 1557 18;</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object></element></point_symbol></symbol>`,
    `<symbol type="1" id="10" code="703" name="Controllo"><point_symbol inner_radius="2325" inner_color="-1" outer_width="350" outer_color="5" elements="0"/></symbol>`,
    `<symbol type="1" id="11" code="706" name="Arrivo"><point_symbol inner_radius="1825" inner_color="-1" outer_width="350" outer_color="5" elements="1"><element><symbol type="1" code=""><point_symbol inner_radius="2825" inner_color="-1" outer_width="350" outer_color="5" elements="0"/></symbol><object type="0"><coords count="1">0 0;</coords></object></element></point_symbol></symbol>`,
    `<symbol type="8" id="12" code="704" name="Numero controllo"><text_symbol icon_text="5"><font family="Sans Serif" size="5588"/><text color="5" line_spacing="1" paragraph_spacing="0" character_spacing="0" kerning="true"/></text_symbol></symbol>`,
    `<symbol type="2" id="13" code="101" name="Curva di livello"><line_symbol color="4" line_width="140" minimum_length="0" join_style="1" cap_style="0" start_offset="0" end_offset="0" segment_length="4000" end_length="0" show_at_least_one_symbol="true" minimum_mid_symbol_count="0" minimum_mid_symbol_count_when_closed="0" dash_length="4000" break_length="1000" dashes_in_group="1" in_group_break_length="500" mid_symbols_per_spot="1" mid_symbol_distance="0"/></symbol>`,
    `<symbol type="2" id="14" code="101.1" name="Curva direttrice"><line_symbol color="4" line_width="250" minimum_length="0" join_style="1" cap_style="0" start_offset="0" end_offset="0" segment_length="4000" end_length="0" show_at_least_one_symbol="true" minimum_mid_symbol_count="0" minimum_mid_symbol_count_when_closed="0" dash_length="4000" break_length="1000" dashes_in_group="1" in_group_break_length="500" mid_symbols_per_spot="1" mid_symbol_distance="0"/></symbol>`,
  ].join('\n');
}

function colorTable(): string {
  return COLORS.map(
    (color, index) =>
      `<color priority="${index}" name="${esc(color.name)}" c="${color.c}" m="${color.m}" y="${color.y}" k="${color.k}" opacity="1"><spotcolors>${color.spot}</spotcolors><cmyk method="custom"/><rgb method="cmyk" r="${color.r}" g="${color.g}" b="${color.b}"/></color>`,
  ).join('\n');
}

function objectTags(feature: Feature): string {
  const tags = [
    `<t k="terrain-o:stato">${feature.verified ? 'verificato' : 'non verificato'}</t>`,
    `<t k="terrain-o:fonte">${esc(feature.source ?? 'manual')}</t>`,
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

function objectXml(feature: Feature, ctx: BuildContext): string | null {
  if (!feature.coords.length) return null;
  const tags = objectTags(feature);
  if (feature.kind === 'area') {
    const symbol = AREA_SYMBOL[feature.type];
    if (symbol == null) return null;
    const rings = [feature.coords, ...(feature.holes ?? [])];
    const coords = rings
      .map((ring, index) => ringCoords(ring, ctx, index === 0 ? FLAG_CLOSE : FLAG_CLOSE_HOLE))
      .join('');
    const count = rings.reduce((sum, ring) => sum + ring.length + 1, 0);
    return `<object type="1" symbol="${symbol}">${tags}<coords count="${count}">${coords}</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object>`;
  }
  if (feature.kind === 'line') {
    const symbol = LINE_SYMBOL[feature.type];
    if (symbol == null) return null;
    const coords = feature.coords.map((point) => coordText(point, ctx)).join('');
    return `<object type="1" symbol="${symbol}">${tags}<coords count="${feature.coords.length}">${coords}</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object>`;
  }
  const symbol = POINT_SYMBOL[feature.type];
  if (symbol == null) return null;
  return `<object type="0" symbol="${symbol}">${tags}<coords count="1">${coordText(feature.coords[0], ctx)}</coords></object>`;
}

function contourObjects(project: Project, ctx: BuildContext): string[] {
  return project.contours
    .filter((contour) => contour.coords.length >= 2)
    .map((contour) => {
      const coords = contour.closed
        ? `${contour.coords.map((p) => coordText(p, ctx)).join('')}${coordText(contour.coords[0], ctx, FLAG_CLOSE)}`
        : contour.coords.map((p) => coordText(p, ctx)).join('');
      const count = contour.coords.length + (contour.closed ? 1 : 0);
      const symbol = contour.index ? SYMBOL_IDS.indexContour : SYMBOL_IDS.contour;
      return `<object type="1" symbol="${symbol}"><coords count="${count}">${coords}</coords><pattern rotation="0"><coord x="0" y="0"/></pattern></object>`;
    });
}

function controlLabels(project: Project, ctx: BuildContext): string[] {
  const labels: string[] = [];
  for (const feature of project.features) {
    if (feature.type !== 'control' || !feature.code) continue;
    const x = round(feature.coords[0].x * ctx.unitsPerPixel + 5000);
    const y = round(feature.coords[0].y * ctx.unitsPerPixel + 1500);
    labels.push(
      `<object type="4" symbol="${SYMBOL_IDS.controlNumber}" h_align="0" v_align="2"><coords count="1">${x} ${y};</coords><text>${esc(feature.code)}</text></object>`,
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
  const featureObjects = project.features
    .map((feature) => objectXml(feature, ctx))
    .filter((value): value is string => Boolean(value));
  const contourObj = contourObjects(project, ctx);
  const labels = controlLabels(project, ctx);
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
    'Simboli ISOM 2017-2 semplificati: 301, 310, 410, 501, 502, 505, 521, 304, 516, 701, 703, 704, 706, 101.',
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
<colors count="${COLORS.length}">
${colorTable()}
</colors>
<barrier version="6" required="0.6.0">
<symbols count="15" id="Terrain / O — base ISOM semplificata">
${symbolDefinitions()}
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
  return {
    unitsPerPixel: mmPerPixel * 1000,
    symbolCount: 15,
    objectCount: project.features.length,
    typeCounts: project.features.reduce<Record<string, number>>((acc, feature) => {
      acc[feature.type] = (acc[feature.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
