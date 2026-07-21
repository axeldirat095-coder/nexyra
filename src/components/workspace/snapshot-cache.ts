import type { FileSystemTree } from "@webcontainer/api";

/**
 * IndexedDB cache for WebContainer node_modules snapshots.
 * Premier boot : ~30-60s (npm install). Boots suivants : ~1s (mount snapshot).
 */
const DB_NAME = "elena-wc-cache";
const STORE = "snapshots";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedSnapshot(key: string): Promise<Uint8Array | null> {
  try {
    const v = await withStore<unknown>("readonly", (s) => s.get(key));
    return v instanceof Uint8Array ? v : null;
  } catch {
    return null;
  }
}

export async function setCachedSnapshot(key: string, data: Uint8Array): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put(data, key));
  } catch {
    // quota / private mode → silently ignore, just slower next time
  }
}

export async function deleteCachedSnapshot(key: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(key));
  } catch {
    // ignore — the next boot can still fall back to npm install
  }
}

export async function getCachedProject(key: string): Promise<FileSystemTree | null> {
  try {
    const v = await withStore<unknown>("readonly", (s) => s.get(key));
    return v && typeof v === "object" ? (v as FileSystemTree) : null;
  } catch {
    return null;
  }
}

export async function setCachedProject(key: string, tree: FileSystemTree): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put(tree, key));
  } catch {
    // quota / private mode → silently ignore, just no project restore next time
  }
}

export async function clearSnapshots(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.clear());
  } catch {
    // ignore
  }
}

/** Stable hash of a JSON-serialisable value (FNV-1a 32-bit). */
export function hashJson(value: unknown): string {
  const str = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
