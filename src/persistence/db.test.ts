import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetRecord } from '../model/types';
import { makeTestProject } from '../test/fixtures';
import {
  DB_VERSION,
  getAsset,
  getProject,
  openTerrainDB,
  putAsset,
  resetDbConnection,
  saveProject,
} from './db';

const DB_NAME = 'terrain-o';

async function deleteRawDatabase(): Promise<void> {
  await resetDbConnection();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // A blocked deletion would leave the old DB in place; the test must fail
    // loudly rather than pass against stale data.
    request.onblocked = () => reject(new Error('deleteDatabase blocked'));
  });
}

/**
 * Recreates the schema emitted by early builds: `assets` (and optionally the
 * other stores) keyed out-of-line, plus the indexes added later.
 */
function createLegacyDatabase(version = 1, brokenStores: string[] = ['assets']): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projects')) {
        database.createObjectStore('projects', { keyPath: 'id' }); // no by-updated index
      }
      if (!database.objectStoreNames.contains('assets')) {
        database.createObjectStore('assets', brokenStores.includes('assets') ? {} : { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('backups')) {
        database.createObjectStore('backups', { keyPath: 'key' }); // no by-project index
      }
      if (!database.objectStoreNames.contains('osmCache')) {
        database.createObjectStore('osmCache', { keyPath: 'key' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('assets', 'readwrite');
      const legacy: AssetRecord = {
        id: 'legacy-asset',
        kind: 'source',
        mimeType: 'image/png',
        dataURL: 'data:image/png;base64,AA==',
        width: 1,
        height: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      // Out-of-line stores require the key as the second argument; inline ones
      // reject it. Detect the key path to seed both variants.
      const store = transaction.objectStore('assets');
      if (store.keyPath == null) store.put(legacy, legacy.id);
      else store.put(legacy);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

function makeAsset(id: string): AssetRecord {
  return {
    id,
    kind: 'source',
    mimeType: 'image/png',
    dataURL: 'data:image/png;base64,AQ==',
    width: 1,
    height: 1,
    createdAt: '2024-02-01T00:00:00.000Z',
  };
}

function expectHealthySchema(database: Awaited<ReturnType<typeof openTerrainDB>>): void {
  const transaction = database.transaction(['projects', 'backups', 'assets'], 'readonly');
  expect(() => transaction.objectStore('projects').index('by-updated')).not.toThrow();
  expect(() => transaction.objectStore('backups').index('by-project')).not.toThrow();
  expect(transaction.objectStore('assets').keyPath).toBe('id');
  transaction.done.catch(() => undefined);
}

describe('IndexedDB schema', () => {
  beforeEach(async () => {
    await deleteRawDatabase();
  });

  afterEach(async () => {
    await resetDbConnection();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it('creates inline keys and indexes on a fresh install', async () => {
    const asset = makeAsset('fresh-asset');
    await putAsset(asset);
    await expect(getAsset(asset.id)).resolves.toEqual(asset);

    const project = makeTestProject();
    // The first save writes the project; the second also writes a backup, which
    // requires the by-project index rebuilt by the migration.
    await saveProject(project, { backup: false });
    await saveProject(project);
    await expect(getProject(project.id)).resolves.toEqual(project);

    expectHealthySchema(await openTerrainDB());
  });

  it('repairs a version 1 legacy database and keeps saved data usable', async () => {
    await createLegacyDatabase(1);

    // Before the repair this call rejects with:
    // "The object store uses out-of-line keys and has no key generator".
    const asset = makeAsset('new-asset');
    await putAsset(asset);

    await expect(getAsset(asset.id)).resolves.toEqual(asset);
    await expect(getAsset('legacy-asset')).resolves.toMatchObject({ id: 'legacy-asset' });

    const project = makeTestProject();
    await saveProject(project);
    await expect(getProject(project.id)).resolves.toEqual(project);

    expectHealthySchema(await openTerrainDB());
  });

  it('repairs a database already sitting at the current version', async () => {
    // An interim build could bump the version without fixing the stores. A
    // plain version bump no longer triggers versionchange, so the repair must
    // detect the broken key path and rebuild at current version + 1.
    await createLegacyDatabase(DB_VERSION);

    const asset = makeAsset('repaired-asset');
    await putAsset(asset);

    await expect(getAsset(asset.id)).resolves.toEqual(asset);
    await expect(getAsset('legacy-asset')).resolves.toMatchObject({ id: 'legacy-asset' });

    const database = await openTerrainDB();
    expect(database.version).toBeGreaterThan(DB_VERSION);
    expectHealthySchema(database);
  });

  it('opens a healthy database created by a newer build without a VersionError', async () => {
    const newerVersion = DB_VERSION + 2;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, newerVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        const projects = database.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('by-updated', 'updatedAt');
        database.createObjectStore('assets', { keyPath: 'id' });
        const backups = database.createObjectStore('backups', { keyPath: 'key' });
        backups.createIndex('by-project', 'projectId');
        database.createObjectStore('osmCache', { keyPath: 'key' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const asset = makeAsset('newer-asset');
    await putAsset(asset);
    await expect(getAsset(asset.id)).resolves.toEqual(asset);

    const database = await openTerrainDB();
    expect(database.version).toBe(newerVersion);
    expectHealthySchema(database);
  });
});
