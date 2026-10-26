import type { BBox, OsmKind, OsmWay, Project, WorldFile } from '../model/types';
import { wgs84ToPixel } from '../geo/projection';
import { getOsmCache, putOsmCache } from '../persistence/db';

/**
 * Public Overpass instances. Only global-coverage mirrors are used: regional
 * instances (e.g. overpass.osm.ch) answer successfully with an empty result for
 * areas outside their database, which looks like "no roads" instead of an
 * error. The official OSM map API is the final fallback and is global.
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;
const OSM_API_ENDPOINT = 'https://api.openstreetmap.org/api/0.6/map';
const QUERY_VERSION = 'v5';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TILE_DEGREES = 0.05;
const MAX_TILES = 25;
const OVERPASS_TIMEOUT_MS = 9_000;
const OSM_API_TIMEOUT_MS = 25_000;
const MAX_TREES_PER_TILE = 2500;
const MAX_TREES_TOTAL = 15000;

type LatLon = { lat: number; lon: number };

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: Array<{
    type: string;
    ref: number;
    role?: string;
    geometry?: LatLon[];
  }>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
  remark?: string;
}

export interface RawOsmWay {
  id: number;
  kind: OsmKind;
  tags: Record<string, string>;
  name?: string;
  geometry: LatLon[];
  holes?: LatLon[][];
  closed?: boolean;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Operazione annullata', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Operazione annullata', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function osmCacheKey(project: Project, bbox: BBox): string {
  const wf: WorldFile | null = project.worldFile;
  const wfPart = wf ? [wf.A, wf.B, wf.C, wf.D, wf.E, wf.F].map((n) => n.toPrecision(10)).join(',') : 'nowf';
  const bboxPart = [bbox.west, bbox.south, bbox.east, bbox.north].map((n) => n.toFixed(5)).join(',');
  const imagePart = project.image ? `${project.image.width}x${project.image.height}` : 'noimg';
  return `osm:${QUERY_VERSION}:${bboxPart}:${imagePart}:${project.projectionWKT ?? 'wgs84'}:${wfPart}`;
}

function splitBBox(bbox: BBox): BBox[] {
  const width = bbox.east - bbox.west;
  const height = bbox.north - bbox.south;
  if (width <= TILE_DEGREES && height <= TILE_DEGREES) return [bbox];
  const cols = Math.ceil(width / TILE_DEGREES);
  const rows = Math.ceil(height / TILE_DEGREES);
  if (cols * rows > MAX_TILES) {
    throw new Error(
      `Area OSM troppo grande: ${cols * rows} riquadri richiesti (massimo ${MAX_TILES}). Ridurre l'immagine o usare un bbox più piccolo.`,
    );
  }
  const cells: BBox[] = [];
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        west: bbox.west + c * cellWidth,
        south: bbox.south + r * cellHeight,
        east: bbox.west + (c + 1) * cellWidth,
        north: bbox.south + (r + 1) * cellHeight,
      });
    }
  }
  return cells;
}

/**
 * One request covers the physical and human-made layers the fusion needs:
 * buildings, land cover, water, roads, paths, barriers and individual trees.
 * Multipolygon relations are requested as well, because most large forests and
 * many building courtyards are relations rather than single ways.
 */
export function buildOverpassQuery(bbox: BBox): string {
  const bounds = `${bbox.south.toFixed(6)},${bbox.west.toFixed(6)},${bbox.north.toFixed(6)},${bbox.east.toFixed(6)}`;
  return `[out:json][timeout:60];
(
  way["highway"](${bounds});
  way["waterway"](${bounds});
  way["building"](${bounds});
  way["landuse"](${bounds});
  way["natural"](${bounds});
  way["leisure"](${bounds});
  way["amenity"](${bounds});
  way["barrier"](${bounds});
  way["railway"](${bounds});
  relation["building"](${bounds});
  relation["landuse"](${bounds});
  relation["natural"](${bounds});
  relation["leisure"](${bounds});
  relation["amenity"](${bounds});
  relation["railway"](${bounds});
  relation["waterway"](${bounds});
);
out body geom;
node["natural"="tree"](${bounds});
out body ${MAX_TREES_PER_TILE};`;
}

export function buildOsmApiUrl(bbox: BBox): string {
  return `${OSM_API_ENDPOINT}?bbox=${bbox.west.toFixed(6)},${bbox.south.toFixed(6)},${bbox.east.toFixed(6)},${bbox.north.toFixed(6)}`;
}

function primaryKind(tags: Record<string, string>): OsmKind | null {
  if (tags.building && tags.building !== 'no') return 'building';
  if (tags.highway) return 'highway';
  if (tags.waterway) return 'waterway';
  if (tags.railway) return 'railway';
  if (tags.barrier) return 'barrier';
  if (tags.landuse) return 'landuse';
  if (tags.natural) return tags.natural === 'tree' ? 'tree' : 'natural';
  if (tags.leisure) return 'leisure';
  if (tags.amenity) return 'amenity';
  return null;
}

function closedRing(geometry: LatLon[]): boolean {
  if (geometry.length < 4) return false;
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  return Math.abs(first.lat - last.lat) < 1e-9 && Math.abs(first.lon - last.lon) < 1e-9;
}

function samePoint(a: LatLon, b: LatLon): boolean {
  return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;
}

/**
 * Multipolygon members are unordered way fragments; they must be chained into
 * closed rings before they can become a polygon. The previous importer only
 * kept ways, so every large forest or lake mapped as a relation was silently
 * lost.
 */
function assembleRings(segments: LatLon[][]): LatLon[][] {
  const pool = segments.filter((segment) => segment.length >= 2).map((segment) => segment.slice());
  const rings: LatLon[][] = [];
  while (pool.length) {
    const first = pool.shift()!;
    const ring = first.slice();
    let guard = 0;
    while (guard++ < 10000) {
      const tail = ring[ring.length - 1];
      if (ring.length >= 4 && samePoint(tail, ring[0])) break;
      let found = -1;
      let reverse = false;
      for (let index = 0; index < pool.length; index++) {
        const segment = pool[index];
        if (samePoint(segment[0], tail)) {
          found = index;
          reverse = false;
          break;
        }
        if (samePoint(segment[segment.length - 1], tail)) {
          found = index;
          reverse = true;
          break;
        }
      }
      if (found < 0) break;
      const segment = pool.splice(found, 1)[0];
      if (reverse) ring.push(...segment.slice(0, -1).reverse());
      else ring.push(...segment.slice(1));
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function pointInRingLatLon(point: LatLon, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.lat > point.lat !== b.lat > point.lat &&
      point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat || 1e-12) + a.lon
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function wayFromElement(element: OverpassElement, tags: Record<string, string>, kind: OsmKind): RawOsmWay | null {
  const geometry = (element.geometry ?? []).filter(
    (node) => Number.isFinite(node.lat) && Number.isFinite(node.lon),
  );
  if (geometry.length < 2) return null;
  return {
    id: element.id,
    kind,
    tags,
    name: tags.name,
    geometry,
    closed: closedRing(geometry),
  };
}

export function parseOverpassElements(elements: OverpassElement[]): RawOsmWay[] {
  const ways: RawOsmWay[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    if (element.type === 'node') {
      const lat = element.lat;
      const lon = element.lon;
      if (tags.natural === 'tree' && typeof lat === 'number' && typeof lon === 'number') {
        ways.push({
          id: element.id,
          kind: 'tree',
          tags,
          name: tags.name,
          geometry: [{ lat, lon }],
          closed: false,
        });
      }
      continue;
    }
    if (element.type === 'way') {
      const kind = primaryKind(tags);
      if (!kind || kind === 'tree') continue;
      const way = wayFromElement(element, tags, kind);
      if (way) ways.push(way);
      continue;
    }
    if (element.type !== 'relation' || !Array.isArray(element.members)) continue;
    const kind = primaryKind(tags);
    if (!kind || kind === 'tree') continue;
    const outer: LatLon[][] = [];
    const inner: LatLon[][] = [];
    for (const member of element.members) {
      if (member.type !== 'way' || !Array.isArray(member.geometry) || member.geometry.length < 2) continue;
      const geometry = member.geometry.filter(
        (node) => Number.isFinite(node.lat) && Number.isFinite(node.lon),
      );
      if (geometry.length < 2) continue;
      if (member.role === 'inner') inner.push(geometry);
      else outer.push(geometry);
    }
    const outerRings = assembleRings(outer);
    if (!outerRings.length) continue;
    const innerRings = assembleRings(inner);
    outerRings.forEach((ring, index) => {
      const holes = innerRings.filter((hole) => hole[0] && pointInRingLatLon(hole[0], ring));
      ways.push({
        // Relations have no way id: use a stable negative id so a re-import
        // updates the same feature instead of duplicating it.
        id: -(element.id * 1000 + index + 1),
        kind,
        tags,
        name: tags.name,
        geometry: ring,
        holes: holes.length ? holes : undefined,
        closed: true,
      });
    });
  }
  return ways;
}

/** Parses the XML returned by the official OSM map API into way geometries. */
export function parseOsmApiXml(xml: string): RawOsmWay[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Risposta XML OSM non valida.');
  const nodes = new Map<string, LatLon>();
  const trees: RawOsmWay[] = [];
  for (const node of doc.getElementsByTagName('node')) {
    const id = node.getAttribute('id');
    const lat = Number(node.getAttribute('lat'));
    const lon = Number(node.getAttribute('lon'));
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const point = { lat, lon };
    nodes.set(id, point);
    const tags: Record<string, string> = {};
    for (const tag of Array.from(node.getElementsByTagName('tag'))) {
      const key = tag.getAttribute('k');
      const value = tag.getAttribute('v');
      if (key && value != null) tags[key] = value;
    }
    if (tags.natural === 'tree') {
      trees.push({ id: Number(id), kind: 'tree', tags, name: tags.name, geometry: [point], closed: false });
    }
  }
  const ways: RawOsmWay[] = [];
  for (const way of doc.getElementsByTagName('way')) {
    const tags: Record<string, string> = {};
    for (const tag of Array.from(way.getElementsByTagName('tag'))) {
      const key = tag.getAttribute('k');
      const value = tag.getAttribute('v');
      if (key && value != null) tags[key] = value;
    }
    const kind = primaryKind(tags);
    if (!kind || kind === 'tree') continue;
    const geometry: LatLon[] = [];
    for (const nd of Array.from(way.getElementsByTagName('nd'))) {
      const node = nodes.get(nd.getAttribute('ref') ?? '');
      if (node) geometry.push(node);
    }
    if (geometry.length < 2) continue;
    ways.push({
      id: Number(way.getAttribute('id')),
      kind,
      tags,
      name: tags.name,
      geometry,
      closed: closedRing(geometry),
    });
  }
  return [...ways, ...trees];
}

interface AttemptOptions {
  signal?: AbortSignal;
  onPhase?: (phase: string) => void;
}

function retryableError(message: string, retryable = true): Error & { retryable?: boolean } {
  const error = new Error(message) as Error & { retryable?: boolean };
  error.retryable = retryable;
  return error;
}

async function withTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (controller: AbortController) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    return await operation(controller);
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Operazione annullata', 'AbortError');
    if (timedOut) throw retryableError(`Nessuna risposta entro ${Math.round(timeoutMs / 1000)} s.`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

async function fetchFromOverpass(url: string, query: string, options: AttemptOptions): Promise<RawOsmWay[]> {
  return withTimeout(OVERPASS_TIMEOUT_MS, options.signal, async (controller) => {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data: query }).toString(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const detail = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      throw retryableError(
        `Overpass HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const json = (await response.json()) as OverpassResponse;
    if (json.remark) throw retryableError(`Overpass: ${json.remark}`);
    return parseOverpassElements(Array.isArray(json.elements) ? json.elements : []);
  });
}

async function fetchFromOsmApi(bbox: BBox, options: AttemptOptions): Promise<RawOsmWay[]> {
  return withTimeout(OSM_API_TIMEOUT_MS, options.signal, async (controller) => {
    const response = await fetch(buildOsmApiUrl(bbox), {
      signal: controller.signal,
      headers: { Accept: 'application/xml' },
    });
    if (!response.ok) {
      throw retryableError(`API OpenStreetMap HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    }
    return parseOsmApiXml(await response.text());
  });
}

/**
 * Requests one bbox tile, trying global Overpass mirrors first and the official
 * OSM map API last. Empty Overpass answers from a mirror are not trusted: they
 * may come from an instance with partial coverage, so the next source is tried.
 */
async function requestWays(
  bbox: BBox,
  options: AttemptOptions,
): Promise<{ ways: RawOsmWay[]; source: string }> {
  const sources: Array<{ label: string; load: () => Promise<RawOsmWay[]> }> = [
    ...OVERPASS_ENDPOINTS.map((url) => ({
      label: new URL(url).host,
      load: () => fetchFromOverpass(url, buildOverpassQuery(bbox), options),
    })),
    {
      label: 'API OpenStreetMap',
      load: () => fetchFromOsmApi(bbox, options),
    },
  ];
  const errors: string[] = [];
  for (let index = 0; index < sources.length; index++) {
    if (options.signal?.aborted) throw new DOMException('Operazione annullata', 'AbortError');
    const source = sources[index];
    options.onPhase?.(`${source.label} · fonte ${index + 1}/${sources.length}`);
    try {
      const ways = await source.load();
      if (ways.length === 0 && index < sources.length - 1) {
        errors.push(`${source.label}: nessun dato restituito`);
        continue;
      }
      return { ways, source: source.label };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${source.label}: ${message}`);
      if ((error as { retryable?: boolean }).retryable === false) continue;
      if (index < sources.length - 1) await delay(500 + Math.random() * 400, options.signal);
    }
  }
  throw new Error(
    `Importazione OSM non riuscita. ${errors.join(' · ')}. Verificare la connessione e riprovare.`,
  );
}

function limitTrees(ways: OsmWay[]): OsmWay[] {
  let trees = 0;
  const limited: OsmWay[] = [];
  for (const way of ways) {
    if (way.kind === 'tree') {
      if (trees >= MAX_TREES_TOTAL) continue;
      trees++;
    }
    limited.push(way);
  }
  return limited;
}

function waysToPixelWays(rawWays: RawOsmWay[], project: Project): OsmWay[] {
  const ways: OsmWay[] = [];
  for (const way of rawWays) {
    const coords = way.geometry
      .map((node) => wgs84ToPixel(project, node.lon, node.lat))
      .filter((p): p is { x: number; y: number } => p != null && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (way.kind === 'tree' ? coords.length < 1 : coords.length < 2) continue;
    let holes: OsmWay['holes'];
    if (way.holes?.length) {
      const converted = way.holes
        .map((ring) =>
          ring
            .map((node) => wgs84ToPixel(project, node.lon, node.lat))
            .filter((p): p is { x: number; y: number } => p != null && Number.isFinite(p.x) && Number.isFinite(p.y)),
        )
        .filter((ring) => ring.length >= 3);
      if (converted.length) holes = converted;
    }
    ways.push({
      id: way.id,
      kind: way.kind,
      highway: way.tags.highway,
      waterway: way.tags.waterway,
      building: way.tags.building,
      landuse: way.tags.landuse,
      natural: way.tags.natural,
      leisure: way.tags.leisure,
      amenity: way.tags.amenity,
      barrier: way.tags.barrier,
      railway: way.tags.railway,
      tags: way.tags,
      name: way.name,
      coords,
      closed: way.closed,
      holes,
    });
  }
  return ways;
}

export interface OsmFetchResult {
  ways: OsmWay[];
  fromCache: boolean;
  source: string;
  cacheKey: string;
  fetchedAt: string;
}

export async function fetchOsmWays(
  project: Project,
  bbox: BBox,
  callbacks: {
    onProgress?: (percent: number, phase: string) => void;
    signal?: AbortSignal;
    force?: boolean;
  } = {},
): Promise<OsmFetchResult> {
  if (!project.worldFile) throw new Error('La georeferenziazione è necessaria per interrogare OSM.');
  const key = osmCacheKey(project, bbox);
  if (!callbacks.force) {
    const cached = await getOsmCache(key);
    if (cached && cached.ways.length > 0) {
      const age = Date.now() - new Date(cached.at).getTime();
      if (age >= 0 && age < CACHE_MAX_AGE_MS) {
        callbacks.onProgress?.(100, 'Dati OSM dalla cache locale');
        return { ways: limitTrees(cached.ways), fromCache: true, source: 'cache locale', cacheKey: key, fetchedAt: cached.at };
      }
    }
  }
  const cells = splitBBox(bbox);
  const byId = new Map<number, OsmWay>();
  const sources = new Set<string>();
  let done = 0;
  for (const cell of cells) {
    if (callbacks.signal?.aborted) throw new DOMException('Operazione annullata', 'AbortError');
    callbacks.onProgress?.(Math.round((done / cells.length) * 90), `Interrogazione OSM ${done + 1}/${cells.length}`);
    const result = await requestWays(cell, {
      signal: callbacks.signal,
      onPhase: (phase) => callbacks.onProgress?.(Math.round((done / cells.length) * 90), phase),
    });
    sources.add(result.source);
    for (const way of waysToPixelWays(result.ways, project)) byId.set(way.id, way);
    done++;
    callbacks.onProgress?.(Math.round((done / cells.length) * 95), `Riquadri completati ${done}/${cells.length}`);
  }
  const ways = limitTrees([...byId.values()]);
  const at = new Date().toISOString();
  await putOsmCache({ key, at, ways });
  callbacks.onProgress?.(100, `OSM: ${ways.length} elementi`);
  return {
    ways,
    fromCache: false,
    source: [...sources].join(', ') || 'OpenStreetMap',
    cacheKey: key,
    fetchedAt: at,
  };
}
