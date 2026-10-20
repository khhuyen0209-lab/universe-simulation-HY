// client/src/api/ephemerisApi.js
// Giao tiếp với backend API, cache IndexedDB, đồng bộ định kỳ, phát hiện offline.
//
// Chiến lược dữ liệu:
//   - Mọi vị trí JPL đều được cache theo "time bucket" (làm tròn 15 phút).
//   - Khi cần vị trí tại thời điểm T: tra cache trước, nếu có và < 1h tuổi -> dùng;
//     nếu không -> gọi API (debounce khi tua thời gian).
//   - Khi offline: trả về cache mới nhất, kèm cờ offline + tuổi dữ liệu.
//   - Không bao giờ gọi API theo từng khung hình render.

const DB_NAME = 'solar-system-3d';
const DB_VERSION = 1;
const STORE = 'ephemeris';
const MAX_CACHE_AGE_MS = 60 * 60 * 1000; // dữ liệu coi là "mới" trong vòng 1 giờ

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'timeBucket' });
        store.createIndex('fetchedAt', 'fetchedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cachePut(record) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    return new Promise((res) => { tx.oncomplete = res; tx.onerror = res; });
  } catch { /* IndexedDB lỗi thì bỏ qua, vẫn chạy được */ }
}

async function cacheGet(timeBucket) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    return new Promise((resolve) => {
      const req = tx.objectStore(STORE).get(timeBucket);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function cacheGetLatest() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    return new Promise((resolve) => {
      const req = tx.objectStore(STORE).index('fetchedAt').openCursor(null, 'prev');
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// Làm tròn thời gian thành bucket 15 phút (khớp với server).
function bucketOf(isoTime) {
  const d = new Date(isoTime);
  const ms = 15 * 60 * 1000;
  return new Date(Math.round(d.getTime() / ms) * ms).toISOString();
}

export default class EphemerisAPI {
  constructor({ apiBase = '', autoSyncIntervalMs = 30 * 60 * 1000 } = {}) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.autoSyncIntervalMs = autoSyncIntervalMs;
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.listeners = new Set();
    this._timer = null;
    this._pendingFetch = new Map(); // timeBucket -> Promise (tránh gọi trùng)

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._setOnline(true));
      window.addEventListener('offline', () => this._setOnline(false));
    }
  }

  _setOnline(v) {
    this.online = v;
    this._emit();
    if (v) this.syncNow(); // có mạng trở lại -> đồng bộ ngay, không gián đoạn mô phỏng
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this.listeners.forEach((fn) => fn({ online: this.online })); }

  async _fetchNetwork(timeBucket) {
    // Tránh gọi trùng cùng lúc cho cùng bucket.
    if (this._pendingFetch.has(timeBucket)) return this._pendingFetch.get(timeBucket);
    const p = (async () => {
      const url = `${this.apiBase}/api/positions?time=${encodeURIComponent(timeBucket)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok && !(res.status === 502 && data && data.requestedTime)) {
        throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
      }
      return data;
    })();
    this._pendingFetch.set(timeBucket, p);
    try { return await p; } finally { this._pendingFetch.delete(timeBucket); }
  }

  /**
   * Lấy vị trí tại một thời điểm. Ưu tiên cache RAM/IndexedDB, sau đó mạng.
   * @returns {Promise<{data:object|null, source:'JPL'|'CACHE'|'OFFLINE_CACHE'|'NONE', ageMs:number, stale:boolean}>}
   */
  async getPositions(isoTime) {
    const bucket = bucketOf(isoTime);
    const cached = await cacheGet(bucket);
    const now = Date.now();

    if (cached) {
      const ageMs = now - new Date(cached.fetchedAt).getTime();
      if (ageMs < MAX_CACHE_AGE_MS && !cached.stale) {
        return { data: cached.data, source: 'CACHE', ageMs, stale: false, timeBucket: bucket };
      }
    }

    if (!this.online) {
      // Offline: trả cache mới nhất (kể cả bucket khác), báo rõ tuổi.
      const latest = await cacheGetLatest();
      if (latest) {
        return {
          data: latest.data, source: 'OFFLINE_CACHE',
          ageMs: now - new Date(latest.fetchedAt).getTime(),
          stale: true, timeBucket: latest.timeBucket, requestedBucket: bucket,
        };
      }
      return { data: null, source: 'NONE', ageMs: Infinity, stale: true, timeBucket: bucket };
    }

    try {
      const data = await this._fetchNetwork(bucket);
      // Chỉ cache khi có dữ liệu thực (không phải lỗi 502 không có dữ liệu).
      if (data && data.bodies && Object.keys(data.bodies).length > 0) {
        await cachePut({ timeBucket: bucket, fetchedAt: data.fetchedAt || new Date().toISOString(), data });
      }
      const ageMs = data && data.fetchedAt ? now - new Date(data.fetchedAt).getTime() : 0;
      return { data, source: data && data.fromCache ? 'CACHE' : 'JPL', ageMs, stale: !!(data && data.stale), timeBucket: bucket };
    } catch (err) {
      // Mạng lỗi: fallback cache cũ.
      const latest = await cacheGetLatest();
      if (latest) {
        return {
          data: latest.data, source: 'OFFLINE_CACHE',
          ageMs: now - new Date(latest.fetchedAt).getTime(),
          stale: true, timeBucket: latest.timeBucket, requestedBucket: bucket, error: err.message,
        };
      }
      return { data: null, source: 'NONE', ageMs: Infinity, stale: true, timeBucket: bucket, error: err.message };
    }
  }

  // Đồng bộ cho thời điểm hiện tại (chạy nền).
  async syncNow() {
    if (!this.online) return null;
    try {
      const result = await this.getPositions(new Date().toISOString());
      this._emit();
      return result;
    } catch { return null; }
  }

  startAutoSync() {
    this.stopAutoSync();
    this._timer = setInterval(() => this.syncNow(), this.autoSyncIntervalMs);
  }
  stopAutoSync() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  async getConfig() {
    try {
      const res = await fetch(`${this.apiBase}/api/config`);
      return await res.json();
    } catch { return null; }
  }
}
