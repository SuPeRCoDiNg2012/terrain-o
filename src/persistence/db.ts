import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetRecord, OsmCacheEntry, Project, ProjectSummary } from '../model/types';

const DB_NAME = 'terrain-o';
const DB_VERSION = 1;
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

export function openTerrainDB(): Promise<IDBPDatabase<TerrainDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TerrainDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' });
          projects.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('backups')) {
          const backups = db.createObjectStore('backups', { keyPath: 'key' });
          backups.createIndex('by-project', 'projectId');
        }
        if (!db.objectStoreNames.contains('osmCache')) db.createObjectStore('osmCache', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

/** Used only by tests to obtain a fresh connection. */
export function resetDbConnection(): void {
  dbPromise = null;
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
