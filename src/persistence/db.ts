import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetRecord, OsmCacheEntry, Project, ProjectSummary } from '../model/types';

const DB_NAME = 'terrain-o';
// v3 repairs databases created by any earlier build whose object stores used
// out-of-line keys. Those stores reject every `put(value)` with a DataError and
// made any import fail with "the object store uses out-of-line keys". The bump
// also covers interim databases that already reached version 2.
export const DB_VERSION = 3;
const LAST_PROJECT_KEY = 'terrain-o:last-project';

interface BackupRecord {
  key: string;
  projectId: string;
  at: string;
  project: Project;
}

interface TerrainDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updated': string };
  };
  assets: {
    key: string;
    value: AssetRecord;
  };
  backups: {
    key: string;
    value: BackupRecord;
    indexes: { 'by-project': string };
  };
  osmCache: {
    key: string;
    value: OsmCacheEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<TerrainDB>> | null = null;

type StoreName = 'projects' | 'assets' | 'backups' | 'osmCache';

interface StoreSpec {
  keyPath: string;
  indexes: Array<{ name: string; keyPath: string }>;
}

const STORE_SPECS: Record<StoreName, StoreSpec> = {
  projects: { keyPath: 'id', indexes: [{ name: 'by-updated', keyPath: 'updatedAt' }] },
  assets: { keyPath: 'id', indexes: [] },
  backups: { keyPath: 'key', indexes: [{ name: 'by-project', keyPath: 'projectId' }] },
  osmCache: { keyPath: 'key', indexes: [] },
};

const STORE_NAMES = Object.keys(STORE_SPECS) as StoreName[];

/**
 * Early builds created one or more stores without an inline key path. Those
 * stores reject every `put(value)` with a DataError, which surfaced during
 * import as "the object store uses out-of-line keys". IndexedDB cannot change
 * a key path in place, and a store cannot be renamed, so the repair reads the
 * records, deletes the store, recreates it correctly and writes them back —
 * all inside the same versionchange transaction.
 */
function migrateSchema(database: IDBDatabase, transaction: IDBTransaction): void {
  for (const name of STORE_NAMES) {
    const spec = STORE_SPECS[name];
    if (!database.objectStoreNames.contains(name)) {
      const created = database.createObjectStore(name, { keyPath: spec.keyPath });
      for (const index of spec.indexes) created.createIndex(index.name, index.keyPath);
      continue;
    }

    const existing = transaction.objectStore(name);
    if (existing.keyPath == null || String(existing.keyPath) !== spec.keyPath) {
      rebuildStore(database, name, spec, existing);
      continue;
    }
    for (const index of spec.indexes) {
      if (!existing.indexNames.contains(index.name)) existing.createIndex(index.name, index.keyPath);
    }
  }
}

function rebuildStore(
  database: IDBDatabase,
  name: StoreName,
  spec: StoreSpec,
  existing: IDBObjectStore,
): void {
  const valuesRequest = existing.getAll();
  const keysRequest = existing.getAllKeys();
  let values: unknown[] | null = null;
  let keys: IDBValidKey[] | null = null;
  let rebuilt = false;

  const rebuild = () => {
    if (rebuilt || values === null || keys === null) return;
    rebuilt = true;
    database.deleteObjectStore(name);
    const store = database.createObjectStore(name, { keyPath: spec.keyPath });
    for (const index of spec.indexes) store.createIndex(index.name, index.keyPath);
    values.forEach((value, position) => {
      if (!value || typeof value !== 'object') return;
      const record: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      const oldKey = keys?.[position];
      if (record[spec.keyPath] == null && oldKey != null) record[spec.keyPath] = oldKey;
      // A record without a usable key cannot live in an inline-key store;
      // skip it instead of aborting the whole migration.
      if (record[spec.keyPath] == null) return;
      store.put(record);
    });
  };

  valuesRequest.onsuccess = () => {
    values = valuesRequest.result as unknown[];
    rebuild();
  };
  keysRequest.onsuccess = () => {
    keys = keysRequest.result as IDBValidKey[];
    rebuild();
  };
}

function isVersionError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'VersionError';
}

function blockedError(): Error {
  return new Error('Database locale bloccato da un’altra scheda aperta: chiuderla e riprovare.');
}

/**
 * Opens the database at `version` with the migration handler, then closes it.
 * Resolves with the version actually stored on disk. A VersionError means that
 * a newer build already owns the database; callers inspect it instead.
 */
function migrateDatabase(version: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    request.onupgradeneeded = () => {
      const transaction = request.transaction;
      if (!transaction) return;
      try {
        migrateSchema(request.result, transaction);
      } catch (error) {
        transaction.abort();
        fail(error);
      }
    };
    request.onerror = () => fail(request.error ?? new Error('Impossibile aprire il database locale.'));
    request.onblocked = () => fail(blockedError());
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      resolve(database.version);
      database.close();
    };
  });
}

interface SchemaInspection {
  version: number;
  broken: boolean;
}

/** Reads the stored key paths without changing the schema. */
function inspectSchema(): Promise<SchemaInspection> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => {
      // migrateDatabase always creates the database first, so this open is
      // read-only. Aborting keeps it that way even if that assumption breaks.
      request.transaction?.abort();
    };
    request.onerror = () => reject(request.error ?? new Error('Impossibile leggere lo schema locale.'));
    request.onblocked = () => reject(blockedError());
    request.onsuccess = () => {
      const database = request.result;
      let broken = false;
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) {
          broken = true;
          break;
        }
        const transaction = database.transaction(name);
        if (String(transaction.objectStore(name).keyPath) !== STORE_SPECS[name].keyPath) {
          broken = true;
          break;
        }
      }
      const version = database.version;
      database.close();
      resolve({ version, broken });
    };
  });
}

/**
 * Makes sure the stored schema matches STORE_SPECS. Databases created by an
 * interim build can already sit at DB_VERSION while still having out-of-line
 * stores, so a plain version bump is not enough: if the schema is still broken
 * after the regular migration, rebuild at current version + 1.
 */
async function ensureSchema(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await migrateDatabase(DB_VERSION);
  } catch (error) {
    // A newer build already owns the database: inspect it instead of failing.
    if (!isVersionError(error)) throw error;
  }

  const inspection = await inspectSchema();
  if (!inspection.broken) return;
  await migrateDatabase(inspection.version + 1);
}

export function openTerrainDB(): Promise<IDBPDatabase<TerrainDB>> {
  if (!dbPromise) {
    const opening = (async () => {
      await ensureSchema();
      // No explicit version: open whatever version the schema repair settled
      // on instead of risking a VersionError against a newer database.
      return openDB<TerrainDB>(DB_NAME);
    })();
    // A blocked or failed opening must not poison every later attempt.
    opening.catch(() => {
      if (dbPromise === opening) dbPromise = null;
    });
    dbPromise = opening;
  }
  return dbPromise;
}

/** Used only by tests to obtain a fresh connection. */
export async function resetDbConnection(): Promise<void> {
  const connection = dbPromise;
  dbPromise = null;
  if (!connection) return;
  try {
    (await connection).close();
  } catch {
    // A failed opening has nothing to close.
  }
}

export class StorageQuotaError extends Error {
  constructor(message = 'Spazio IndexedDB esaurito: esportare il progetto e liberare spazio.') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)) return true;
  const name = (error as { name?: string }).name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

async function guardQuota<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isQuotaError(error)) throw new StorageQuotaError();
    throw error;
  }
}

export async function putAsset(asset: AssetRecord): Promise<void> {
  await guardQuota(async () => {
    const db = await openTerrainDB();
    await db.put('assets', asset);
  });
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  const db = await openTerrainDB();
  return db.get('assets', id);
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openTerrainDB();
  await db.delete('assets', id);
}

export async function saveProject(project: Project, opts: { backup?: boolean } = {}): Promise<void> {
  await guardQuota(async () => {
    const db = await openTerrainDB();
    const tx = db.transaction(['projects', 'backups'], 'readwrite');
    await tx.objectStore('projects').put(project);
    if (opts.backup !== false) {
      const backups = tx.objectStore('backups');
      const keys = await backups.index('by-project').getAllKeys(project.id);
      const record: BackupRecord = {
        key: `${project.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        projectId: project.id,
        at: new Date().toISOString(),
        project,
      };
      await backups.put(record);
      const all = await Promise.all(keys.map(async (key) => backups.get(key)));
      const ordered = all
        .filter((r): r is BackupRecord => Boolean(r))
        .sort((a, b) => (a.at < b.at ? -1 : 1));
      while (ordered.length >= 3) {
        const oldest = ordered.shift()!;
        await backups.delete(oldest.key);
      }
    }
    await tx.done;
  });
  setLastProjectId(project.id);
}

export async function saveBackupOnly(project: Project): Promise<void> {
  await guardQuota(async () => {
    const db = await openTerrainDB();
    const tx = db.transaction('backups', 'readwrite');
    const store = tx.objectStore('backups');
    await store.put({
      key: `${project.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      projectId: project.id,
      at: new Date().toISOString(),
      project,
    });
    const all = await store.index('by-project').getAll(project.id);
    const ordered = all.sort((a, b) => (a.at < b.at ? -1 : 1));
    while (ordered.length > 3) await store.delete(ordered.shift()!.key);
    await tx.done;
  });
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await openTerrainDB();
  return db.get('projects', id);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openTerrainDB();
  const project = await db.get('projects', id);
  const tx = db.transaction(['projects', 'assets', 'backups'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  const keys = await tx.objectStore('backups').index('by-project').getAllKeys(id);
  await Promise.all(keys.map((key) => tx.objectStore('backups').delete(key)));
  if (project) {
    const assetIds = new Set<string>();
    if (project.image) assetIds.add(project.image.assetId);
    if (project.classification) {
      assetIds.add(project.classification.assetId);
      assetIds.add(`${project.classification.assetId}:labels`);
    }
    await Promise.all([...assetIds].map((assetId) => tx.objectStore('assets').delete(assetId)));
  }
  await tx.done;
  if (getLastProjectId() === id) setLastProjectId(null);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openTerrainDB();
  const projects = await db.getAll('projects');
  return projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      hasImage: Boolean(project.image),
      featureCount: project.features.length,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function setLastProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // localStorage can be unavailable in private contexts; IndexedDB still works.
  }
}

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  supported: boolean;
}

export async function estimateStorage(): Promise<StorageEstimate> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0, supported: false };
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, supported: true };
}

export async function putOsmCache(entry: OsmCacheEntry): Promise<void> {
  await guardQuota(async () => {
    const db = await openTerrainDB();
    await db.put('osmCache', entry);
    const all = await db.getAll('osmCache');
    if (all.length > 120) {
      all.sort((a, b) => (a.at < b.at ? -1 : 1));
      await Promise.all(all.slice(0, all.length - 120).map((old) => db.delete('osmCache', old.key)));
    }
  });
}

export async function getOsmCache(key: string): Promise<OsmCacheEntry | undefined> {
  const db = await openTerrainDB();
  return db.get('osmCache', key);
}

export async function clearOsmCache(): Promise<void> {
  const db = await openTerrainDB();
  await db.clear('osmCache');
}

export async function deleteDatabase(): Promise<void> {
  const db = await openTerrainDB();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
