/**
 * Minimal IndexedDB wrapper. Everything stays on this device.
 * Falls back to memory when IndexedDB is unavailable (some private modes).
 */
const DB_NAME = 'facelet';
const VERSION = 1;

export type StoreName = 'sessions' | 'solves' | 'kv';

let dbp: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, any>> = { sessions: new Map(), solves: new Map(), kv: new Map() };
export let persistent = true;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      persistent = false;
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('solves')) {
        const s = d.createObjectStore('solves', { keyPath: 'id' });
        s.createIndex('session', 'sessionId');
      }
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      persistent = false;
      resolve(null);
    };
    req.onblocked = () => {
      persistent = false;
      resolve(null);
    };
  });
  return dbp;
}

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const d = await open();
  if (!d) return [...memory[store].values()];
  return wrap(d.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function getByIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
  const d = await open();
  if (!d) return [...memory[store].values()].filter((v) => v[index === 'session' ? 'sessionId' : index] === key);
  return wrap(d.transaction(store).objectStore(store).index(index).getAll(key)) as Promise<T[]>;
}

/** Number of records under one index key, without loading them. */
export async function countByIndex(store: StoreName, index: string, key: IDBValidKey): Promise<number> {
  const d = await open();
  if (!d) return [...memory[store].values()].filter((v) => v[index === 'session' ? 'sessionId' : index] === key).length;
  return wrap(d.transaction(store).objectStore(store).index(index).count(key));
}

export async function put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  const d = await open();
  if (!d) {
    memory[store].set(value.id, structuredClone(value));
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).put($snapshot(value));
  return done(tx);
}

export async function putMany<T extends { id: string }>(store: StoreName, values: T[]): Promise<void> {
  const d = await open();
  if (!d) {
    for (const v of values) memory[store].set(v.id, structuredClone(v));
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put($snapshot(v));
  return done(tx);
}

export async function remove(store: StoreName, key: string): Promise<void> {
  const d = await open();
  if (!d) {
    memory[store].delete(key);
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

export async function removeMany(store: StoreName, keys: string[]): Promise<void> {
  const d = await open();
  if (!d) {
    for (const k of keys) memory[store].delete(k);
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const k of keys) os.delete(k);
  return done(tx);
}

export async function clear(store: StoreName): Promise<void> {
  const d = await open();
  if (!d) {
    memory[store].clear();
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return done(tx);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const d = await open();
  if (!d) return memory.kv.get(key);
  return wrap(d.transaction('kv').objectStore('kv').get(key)) as Promise<T | undefined>;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const d = await open();
  if (!d) {
    memory.kv.set(key, structuredClone(value));
    return;
  }
  const tx = d.transaction('kv', 'readwrite');
  tx.objectStore('kv').put($snapshot(value), key);
  return done(tx);
}

/** Deep plain copy (strips Svelte proxies) for structured cloning. */
function $snapshot<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

export async function kvDelete(key: string): Promise<void> {
  const d = await open();
  if (!d) {
    memory.kv.delete(key);
    return;
  }
  const tx = d.transaction('kv', 'readwrite');
  tx.objectStore('kv').delete(key);
  return done(tx);
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
