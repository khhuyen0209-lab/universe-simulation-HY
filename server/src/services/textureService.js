// server/src/services/textureService.js
// Tải + cache + (nếu cần) giải nén bản đồ hành tinh.
//
// CHIẾN LƯỢC CHỐNG LỖI "Khong tai duoc texture" (theo thứ tự ưu tiên):
//   1. BUNDLED 2k: bản 2k đã được NHÚNG SẴN trong repo (server/textures-bundled/,
//      ~4.7MB). Server KHÔNG cần mạng để trả ảnh thật 2k -> luôn thành công.
//   2. RAM cache (nóng) + ĐĨA cache (server/.cache/textures, bền qua restart).
//   3. Tải trực tiếp từ solarsystemscope (chỉ cho 8k, hoặc 2k nếu thiếu bundled).
//      LƯU Ý: KHÔNG đặt User-Agent trình duyệt (Cloudflare chặn 403). Thêm Referer.
//   4. Nếu tải 8k lỗi / không có (uranus, neptune) -> TỰ FALLBACK về 2k bundled.
//   5. Nếu file tải về là ZIP -> tự giải nén lấy ảnh bên trong.
//
// Kết quả: client LUÔN nhận được ảnh thật (ít nhất 2k); canvas chỉ là fallback
// cuối cùng của client khi ngay cả server cũng lỗi (gần như không xảy ra).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
const IMG_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

function fileEntry(name) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || ['', 'jpg'])[1].toLowerCase();
  return { file: name, ext, mime: MIME_BY_EXT[ext] || 'image/jpeg' };
}

// body -> { '2k': entry | null, '8k': entry | null }
// 8k của uranus & neptune không tồn tại trên nguồn -> null (tự fallback 2k bundled).
export const TEXTURE_MAP = {
  sun:         { '2k': fileEntry('2k_sun.jpg'),              '8k': fileEntry('8k_sun.jpg') },
  mercury:     { '2k': fileEntry('2k_mercury.jpg'),          '8k': fileEntry('8k_mercury.jpg') },
  venus:       { '2k': fileEntry('2k_venus_surface.jpg'),    '8k': fileEntry('8k_venus_surface.jpg') },
  earth:       { '2k': fileEntry('2k_earth_daymap.jpg'),     '8k': fileEntry('8k_earth_daymap.jpg') },
  mars:        { '2k': fileEntry('2k_mars.jpg'),             '8k': fileEntry('8k_mars.jpg') },
  jupiter:     { '2k': fileEntry('2k_jupiter.jpg'),          '8k': fileEntry('8k_jupiter.jpg') },
  saturn:      { '2k': fileEntry('2k_saturn.jpg'),           '8k': fileEntry('8k_saturn.jpg') },
  uranus:      { '2k': fileEntry('2k_uranus.jpg'),           '8k': null },
  neptune:     { '2k': fileEntry('2k_neptune.jpg'),          '8k': null },
  'saturn-ring': {
    '2k': fileEntry('2k_saturn_ring_alpha.png'),
    '8k': fileEntry('8k_saturn_ring_alpha.png'),
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TextureService {
  constructor({
    cacheDir,
    bundledDir = path.resolve(__dirname, '../../textures-bundled'),
    baseUrl = 'https://www.solarsystemscope.com/textures/download/',
    timeoutMs = 60000,
    logger = console,
  } = {}) {
    this.cacheDir = cacheDir || path.resolve(__dirname, '../../.cache/textures');
    this.bundledDir = bundledDir;
    this.baseUrl = baseUrl.replace(/\/+$/, '') + '/';
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.ram = new Map();        // key `${body}:${res}` -> { buf, ext, mime }
    this.inflight = new Map();   // key -> Promise (chống tải trùng)
    this.diskIndex = new Set();  // `${body}:${res}:${ext}` trong cache đĩa
    this.bundledIndex = new Set(); // `${body}:${res}:${ext}` có sẵn trong repo
    this._ensureCacheDir();
    this._loadDiskIndex();
    this._loadBundledIndex();
  }

  _ensureCacheDir() {
    try { fs.mkdirSync(this.cacheDir, { recursive: true }); } catch { /* bỏ qua */ }
  }

  _scanDirInto(dir, set) {
    try {
      for (const f of fs.readdirSync(dir)) {
        const m = f.match(/^([a-z-]+)_(2k|8k)\.(jpg|jpeg|png|webp)$/i);
        if (m) set.add(`${m[1].toLowerCase()}:${m[2].toLowerCase()}:${m[3].toLowerCase()}`);
      }
    } catch { /* thư mục chưa có */ }
  }

  _loadDiskIndex() { this._scanDirInto(this.cacheDir, this.diskIndex); }
  _loadBundledIndex() { this._scanDirInto(this.bundledDir, this.bundledIndex); }

  _pathFor(baseDir, body, res, ext) { return path.join(baseDir, `${body}_${res}.${ext}`); }

  // Đọc từ đĩa (cache writable trước, rồi bundled read-only). Lưu vào RAM.
  _readDisk(body, res) {
    const sources = [
      { dir: this.cacheDir, set: this.diskIndex, source: 'disk' },
      { dir: this.bundledDir, set: this.bundledIndex, source: 'bundled' },
    ];
    for (const { dir, set, source } of sources) {
      for (const ext of IMG_EXTS) {
        if (!set.has(`${body}:${res}:${ext}`)) continue;
        try {
          const buf = fs.readFileSync(this._pathFor(dir, body, res, ext));
          if (buf.length < 100) continue;
          const entry = { buf, ext, mime: MIME_BY_EXT[ext] || 'image/jpeg', actualRes: res, source };
          this.ram.set(`${body}:${res}`, entry);
          return entry;
        } catch { continue; }
      }
    }
    return null;
  }

  _writeDisk(body, res, ext, buf) {
    try {
      fs.writeFileSync(this._pathFor(this.cacheDir, body, res, ext), buf);
      this.diskIndex.add(`${body}:${res}:${ext}`);
    } catch (e) {
      this.logger.warn?.('[texture] ghi disk cache that bai:', e.message);
    }
  }

  _detectKind(buf) {
    if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && (buf[2] === 0x03 || buf[2] === 0x05) && buf[3] === 0x04) return 'zip';
    if (buf.length >= 6 && buf[0] === 0x37 && buf[1] === 0x7A && buf[2] === 0xBC && buf[3] === 0xAF && buf[4] === 0x27 && buf[5] === 0x1C) return '7z';
    if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return 'unknown';
  }

  // Giải nén ZIP, trả file ảnh lớn nhất bên trong (hỗ trợ store + deflate).
  _extractImageFromZip(buf) {
    let eocd = -1;
    const start = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= start; i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Khong tim thay EOCD trong file zip.');
    const totalEntries = buf.readUInt16LE(eocd + 10);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    let pos = cdOffset;
    let chosen = null;
    const IMG_RE = /\.(jpe?g|png|webp|tiff?|bmp)$/i;
    for (let e = 0; e < totalEntries && pos + 46 <= buf.length; e++) {
      if (buf.readUInt32LE(pos) !== 0x02014B50) break;
      const method = buf.readUInt16LE(pos + 10);
      const compSize = buf.readUInt32LE(pos + 20);
      const uncompSize = buf.readUInt32LE(pos + 24);
      const nameLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);
      const localOffset = buf.readUInt32LE(pos + 42);
      const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
      if (IMG_RE.test(name) && (!chosen || uncompSize > chosen.uncompSize)) {
        chosen = { method, compSize, uncompSize, localOffset, name };
      }
      pos += 46 + nameLen + extraLen + commentLen;
    }
    if (!chosen) throw new Error('Khong tim thay file anh ben trong zip.');
    const lh = chosen.localOffset;
    if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034B50) throw new Error('Local header zip khong hop le.');
    const lhNameLen = buf.readUInt16LE(lh + 26);
    const lhExtraLen = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const compData = buf.subarray(dataStart, dataStart + chosen.compSize);
    let out;
    if (chosen.method === 0) out = compData;
    else if (chosen.method === 8) out = zlib.inflateRawSync(compData);
    else throw new Error(`Zip dung phuong thuc nen khong ho tro (method=${chosen.method}).`);
    const ext = (chosen.name.match(/\.([a-z0-9]+)$/i) || ['', 'jpg'])[1].toLowerCase();
    return { buf: Buffer.from(out), ext, mime: MIME_BY_EXT[ext] || 'image/jpeg' };
  }

  // Tải 1 lần từ nguồn. KHÔNG đặt User-Agent browser (Cloudflare 403).
  async _downloadOnce(body, res) {
    const entry = TEXTURE_MAP[body] && TEXTURE_MAP[body][res];
    if (!entry) return null; // độ phân giải này không có trên nguồn
    const url = this.baseUrl + entry.file;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        // Không set 'User-Agent'. Thêm Referer hợp lệ để giảm tỉ lệ bị chặn.
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          Referer: 'https://www.solarsystemscope.com/textures/',
        },
        redirect: 'follow',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} tai ${entry.file}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 100) throw new Error(`File qua nho (${buf.length}B) — co the bi chan.`);
      const kind = this._detectKind(buf);
      if (kind === 'unknown') throw new Error('File tai ve khong phai anh/archive hop le.');
      if (kind === '7z') throw new Error('File 7z chua ho tro giai nen thuần Node.');
      if (kind === 'zip') {
        const ex = this._extractImageFromZip(buf);
        return { buf: ex.buf, ext: ex.ext, mime: ex.mime };
      }
      return { buf, ext: entry.ext, mime: entry.mime };
    } finally {
      clearTimeout(timer);
    }
  }

  async _download(body, res) {
    let lastErr;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await this._downloadOnce(body, res);
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await sleep(600 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  // API chính. Thứ tự: RAM -> ĐĨA (cache + bundled) -> TẢI. Fallback 8k<->2k.
  async get(body, resAsked) {
    const bodyKey = String(body || '').toLowerCase();
    if (!TEXTURE_MAP[bodyKey]) throw new Error(`Body khong ton tai: ${bodyKey}`);
    const asked = resAsked === '8k' ? '8k' : '2k';
    const order = asked === '8k' ? ['8k', '2k'] : ['2k', '8k'];
    let lastErr;
    for (const res of order) {
      if (!TEXTURE_MAP[bodyKey][res] && !this._hasAnyDisk(bodyKey, res)) continue;
      const key = `${bodyKey}:${res}`;
      const ramHit = this.ram.get(key);
      if (ramHit) return { ...ramHit, actualRes: res, source: ramHit.source || 'ram' };
      const diskHit = this._readDisk(bodyKey, res);
      if (diskHit) return diskHit;
      if (!TEXTURE_MAP[bodyKey][res]) continue; // không có trên nguồn -> bỏ qua tải
      if (!this.inflight.has(key)) {
        this.inflight.set(key, (async () => {
          try {
            const dl = await this._download(bodyKey, res);
            if (!dl) return null;
            const entry = { buf: dl.buf, ext: dl.ext, mime: dl.mime };
            this.ram.set(key, entry);
            this._writeDisk(bodyKey, res, dl.ext, dl.buf);
            return entry;
          } finally {
            this.inflight.delete(key);
          }
        })());
      }
      try {
        const dl = await this.inflight.get(key);
        if (dl) return { buf: dl.buf, mime: dl.mime, actualRes: res, source: 'download' };
      } catch (e) {
        lastErr = e;
        this.logger.warn?.(`[texture] tai ${bodyKey} ${res} that bai: ${e.message}`);
      }
    }
    throw lastErr || new Error(`Khong tai duoc texture cho ${bodyKey} (ca 2k lan 8k).`);
  }

  _hasAnyDisk(body, res) {
    for (const ext of IMG_EXTS) {
      if (this.diskIndex.has(`${body}:${res}:${ext}`) || this.bundledIndex.has(`${body}:${res}:${ext}`)) return true;
    }
    return false;
  }

  // Tải trước (background) các độ phân giải CHƯA có sẵn (thường là 8k).
  async prewarm(resolutions = ['2k']) {
    const bodies = Object.keys(TEXTURE_MAP);
    const tasks = [];
    for (const res of resolutions) {
      for (const b of bodies) {
        if (this._hasAnyDisk(b, res)) continue; // đã có bundled/disk -> khỏi tải
        if (!TEXTURE_MAP[b][res]) continue;
        tasks.push(this.get(b, res).catch((e) => this.logger.warn?.(`[texture] prewarm ${b} ${res} bo qua: ${e.message}`)));
      }
    }
    if (tasks.length === 0) { this.logger.log?.('[texture] prewarm: da co san tat ca texture, bo qua tai.'); return; }
    await Promise.allSettled(tasks);
    this.logger.log?.(`[texture] prewarm xong ${tasks.length} file.`);
  }

  status() {
    const out = {};
    for (const [body, ress] of Object.entries(TEXTURE_MAP)) {
      out[body] = {};
      for (const res of ['2k', '8k']) {
        if (!ress[res] && !this._hasAnyDisk(body, res)) { out[body][res] = 'unavailable'; continue; }
        const key = `${body}:${res}`;
        if (this.ram.has(key)) out[body][res] = { cached: 'ram', bytes: this.ram.get(key).buf.length };
        else if (this._hasAnyDisk(body, res)) {
          const isBundled = IMG_EXTS.some((e) => this.bundledIndex.has(`${body}:${res}:${e}`));
          out[body][res] = { cached: isBundled ? 'bundled' : 'disk' };
        } else out[body][res] = { cached: false };
      }
    }
    return out;
  }
}

export default TextureService;
