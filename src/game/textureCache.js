const DB_NAME = 'quantum-rim-textures';
const STORE = 'blobs';
const memory = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function rememberTextureUrl(key, url) {
  if (key && url) memory.set(key, url);
}

export function recallTextureUrl(key) {
  return memory.get(key) || null;
}

export async function putTextureBlob(key, blob) {
  rememberTextureUrl(key, memory.get(key));
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function resolveCachedTexture(key) {
  if (!key) return null;
  if (memory.has(key)) return memory.get(key);
  try {
    const db = await openDb();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    memory.set(key, url);
    return url;
  } catch {
    return memory.get(key) || null;
  }
}
