// One IndexedDB database for everything LumiOS caches from the TV. Stores are created here so
// every module opens the same version.
export const DB_NAME = 'lumios';
export const DB_VERSION = 2;
export const STORES = ['tv-icons', 'packs'] as const;
export type StoreName = (typeof STORES)[number];

export function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        for (const store of STORES)
          if (!request.result.objectStoreNames.contains(store))
            request.result.createObjectStore(store, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function readStore<T>(
  db: IDBDatabase,
  store: StoreName,
  accept: (row: unknown) => row is T,
) {
  return new Promise<T[]>((resolve) => {
    try {
      const request = db.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve((request.result as unknown[]).filter(accept));
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export function writeStore(
  db: IDBDatabase,
  store: StoreName,
  records: { id: string }[],
  removals: string[],
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(store, 'readwrite');
      const table = transaction.objectStore(store);
      for (const id of removals) table.delete(id);
      for (const record of records) table.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
