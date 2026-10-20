// server/src/cache/cacheStore.js
// Lớp cache hai tầng:
//   1. RAM (Map) — nhanh, chính, mất khi process khởi động lại.
//   2. Disk snapshot (file JSON) — best-effort, thử khôi phục khi khởi động lại.
// LƯU Ý: Trên Render (đặc biệt gói Free), filesystem KHÔNG bền giữa các deploy
// và có thể bị reset bất cứ lúc nào. Do đó disk snapshot chỉ là tối ưu, không
// được coi là nguồn dữ liệu đáng tin cậy lâu dài. Mọi entry đều có TTL và được
// kiểm tra tuổi trước khi trả về.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE = path.resolve(__dirname, '../../.cache/ephemeris-snapshot.json');

export default class CacheStore {
  constructor({ ttlMs = 30 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.map = new Map(); // key -> { value, expiresAt }
    this._loadSnapshot();
  }

  _loadSnapshot() {
    try {
      if (!fs.existsSync(SNAPSHOT_FILE)) return;
      const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
      const data = JSON.parse(raw);
      const now = Date.now();
      let restored = 0;
      for (const [key, entry] of Object.entries(data)) {
        if (entry && typeof entry.expiresAt === 'number' && entry.expiresAt > now) {
          this.map.set(key, entry);
          restored++;
        }
      }
      if (restored > 0) {
        console.log(`[cache] Đã khôi phục ${restored} entry từ snapshot đĩa.`);
      }
    } catch (err) {
      console.warn('[cache] Không đọc được snapshot đĩa (bỏ qua):', err.message);
    }
  }

  _saveSnapshot() {
    try {
      const dir = path.dirname(SNAPSHOT_FILE);
      fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.map.entries()) obj[k] = v;
      fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(obj), 'utf8');
    } catch (err) {
      // Disk cache là best-effort, không làm sập server nếu lỗi.
      console.warn('[cache] Không ghi snapshot đĩa (bỏ qua):', err.message);
    }
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    const entry = { value, expiresAt: Date.now() + this.ttlMs };
    this.map.set(key, entry);
    // Ghi snapshot không đồng bộ để không chặn request.
    setImmediate(() => this._saveSnapshot());
  }

  // Trả về entry ngay cả khi đã hết hạn, kèm cờ stale. Dùng để fallback.
  getStale(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    return { value: entry.value, stale: Date.now() > entry.expiresAt, expiresAt: entry.expiresAt };
  }

  clear() {
    this.map.clear();
    try { fs.unlinkSync(SNAPSHOT_FILE); } catch { /* ignore */ }
  }
}
