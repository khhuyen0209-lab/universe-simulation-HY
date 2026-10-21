// server/src/services/textureService.js
// Tải + cache + (nếu cần) giải nén bản đồ hành tinh từ solarsystemscope.com.
//
// QUAN TRỌNG — nguyên nhân lỗi "server không tải được ảnh":
//   Trang này đứng sau Cloudflare. Nếu đặt header User-Agent giả dạng trình duyệt
//   (Chrome/...), Cloudflare trả 403 (trang chặn bot). KHÔNG đặt UA, hoặc dùng UA
//   tối giản của Node -> tải bình thường (HTTP 200).
//
// Đặc điểm:
//   - 2k: file .jpg trực tiếp (~0.2–0.9 MB).
//   - 8k: file .jpg trực tiếp (8192×4096, ~3–15 MB). URANUS & NEPTUNE không có bản
//         8k trên nguồn -> tự fallback về 2k.
//   - Nếu file tải về là archive (ZIP, phát hiện bằng magic bytes) -> tự giải nén,
//     lấy file ảnh lớn nhất bên trong rồi mới gửi client. (7z/RAR không hỗ trợ
//     giải nén thuần Node; nếu gặp sẽ báo lỗi và fallback độ phân giải kia.)
//   - Cache 2 lớp: RAM (nóng) + ĐĨA (bền, sống qua restart/sleep của Render).
//   - Chống tải trùng: cùng (body,res) đang tải thì các request khác chờ chung promise.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

function fileEntry(name) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || ['', 'jpg'])[1].toLowerCase();
  return { file: name, ext, mime: MIME_BY_EXT[ext] || 'image/jpeg' };
}

// body -> { '2k': entry | null, '8k': entry | null }
// 8k của uranus & neptune không tồn tại trên nguồn -> null (tự fallback 2k).
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
  constructor({ cacheDir, baseUrl = 'https://www.solarsystemscope.com/textures/download/', timeoutMs = 60000, logger = console } = {}) {
    this.cacheDir = cacheDir || path.resolve(__dirname, '../../.cache/textures');
    this.baseUrl = baseUrl.replace(/\/+$/, '') + '/';
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.ram = new Map();      // key `${body}:${res}` -> { buf, ext, mime, actualRes }
    this.inflight = new Map(); // key -> Promise (chống tải trùng)
    this._ensureCacheDir();
    this._loadFromDisk();
  }

  _ensureCacheDir() {
    try { fs.mkdirSync(this.cacheDir, { recursive: true }); } catch { /* bỏ qua */ }
  }

  _diskPath(body, res, ext) {
    return path.join(this.cacheDir, `${body}_${res}.${ext}`);
  }

  // Khởi động: quét cache đĩa có sẵn vào RAM (chỉ metadata, đọc file khi cần).
  // Để đơn giản & tiết kiệm RAM, ta KHÔNG load toàn bộ byte vào lúc khởi động;
  // mà chỉ đánh dấu có file trên đĩa. Khi request thật mới đọc vào RAM.
  _loadFromDisk() {
    this.diskIndex = new Set(); // `${body}:${res}:${ext}`
    try {
      for (const f of fs.readdirSync(this.cacheDir)) {
        const m = f.match(/^([a-z-]+)_(2k|8k)\.(jpg|jpeg|png|webp)$/i);
        if (m) this.diskIndex.add(`${m[1].toLowerCase()}:${m[2].toLowerCase()}:${m[3].toLowerCase()}`);
      }
    } catch { /* chưa có thư mục */ }
  }

  _readDisk(body, res) {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      const key = `${body}:${res}:${ext}`;
      if (!this.diskIndex.has(key)) continue;
      const p = this._diskPath(body, res, ext);
      try {
        const buf = fs.readFileSync(p);
        if (buf.length < 100) continue; // file hỏng/rỗng -> bỏ
        const entry = { buf, ext, mime: MIME_BY_EXT[ext] || 'image/jpeg', actualRes: res, source: 'disk' };
        this.ram.set(`${body}:${res}`, entry);
        return entry;
      } catch { continue; }
    }
    return null;
  }

  _writeDisk(body, res, ext, buf) {
    try {
      fs.writeFileSync(this._diskPath(body, res, ext), buf);
      this.diskIndex.add(`${body}:${res}:${ext}`);
    } catch (e) {
      this.logger.warn?.('[texture] ghi disk cache that bai:', e.message);
    }
  }

  // Phát hiện loại file bằng magic bytes.
  _detectKind(buf) {
    if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && (buf[2] === 0x03 || buf[2] === 0x05) && buf[3] === 0x04) return 'zip';
    if (buf.length >= 6 && buf[0] === 0x37 && buf[1] === 0x7A && buf[2] === 0xBC && buf[3] === 0xAF && buf[4] === 0x27 && buf[5] === 0x1C) return '7z';
    if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return 'unknown';
  }

  // Giải nén ZIP, trả file ảnh (jpg/png/webp/tiff/bmp) lớn nhất bên trong.
  // Dùng Central Directory để định vị chính xác, hỗ trợ cả data descriptor.
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

  // Tải 1 lần, KHÔNG đặt User-Agent trình duyệt (tránh Cloudflare 403).
  async _downloadOnce(body, res) {
    const entry = TEXTURE_MAP[body] && TEXTURE_MAP[body][res];
    if (!entry) return null; // độ phân giải này không có sẵn trên nguồn
    const url = this.baseUrl + entry.file;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        // Không set 'User-Agent': Node fetch mặc định (không có UA) hoặc UA tối giản
        // mới đi qua Cloudflare của solarsystemscope. UA browser -> 403.
        headers: { Accept: 'image/*,*/*;q=0.8' },
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
      // Ảnh thẳng (jpeg/png/webp).
      return { buf, ext: entry.ext, mime: entry.mime };
    } finally {
      clearTimeout(timer);
    }
  }

  // Tải với retry (backoff tuyến tính).
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

  // API chính: lấy texture cho body với độ phân giải mong muốn.
  // Tự fallback: nếu res yêu cầu lỗi/không có -> thử res còn lại.
  // Trả về { buf, mime, actualRes, source }.
  async get(body, resAsked) {
    const bodyKey = String(body || '').toLowerCase();
    if (!TEXTURE_MAP[bodyKey]) throw new Error(`Body khong ton tai: ${bodyKey}`);
    const asked = resAsked === '8k' ? '8k' : '2k';
    const order = asked === '8k' ? ['8k', '2k'] : ['2k', '8k'];
    let lastErr;
    for (const res of order) {
      if (!TEXTURE_MAP[bodyKey][res]) continue; // độ phân giải không có trên nguồn
      const key = `${bodyKey}:${res}`;
      // 1. RAM cache
      const ramHit = this.ram.get(key);
      if (ramHit) return { ...ramHit, actualRes: res, source: ramHit.source || 'ram' };
      // 2. Đĩa cache
      const diskHit = this._readDisk(bodyKey, res);
      if (diskHit) return diskHit;
      // 3. Tải (chống trùng)
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

  // Tải trước (background) để lần request đầu tiên không phải chờ.
  async prewarm(resolutions = ['2k']) {
    const bodies = Object.keys(TEXTURE_MAP);
    const tasks = [];
    for (const res of resolutions) {
      for (const b of bodies) {
        if (!TEXTURE_MAP[b][res]) continue;
        tasks.push(this.get(b, res).catch((e) => this.logger.warn?.(`[texture] prewarm ${b} ${res} bo qua: ${e.message}`)));
      }
    }
    await Promise.allSettled(tasks);
    this.logger.log?.(`[texture] prewarm xong ${tasks.length} file.`);
  }

  // Trạng thái cache (cho /api/textures/status).
  status() {
    const out = {};
    for (const [body, ress] of Object.entries(TEXTURE_MAP)) {
      out[body] = {};
      for (const res of ['2k', '8k']) {
        if (!ress[res]) { out[body][res] = 'unavailable'; continue; }
        const key = `${body}:${res}`;
        if (this.ram.has(key)) out[body][res] = { cached: 'ram', bytes: this.ram.get(key).buf.length };
        else if (this._hasDisk(body, res)) out[body][res] = { cached: 'disk' };
        else out[body][res] = { cached: false };
      }
    }
    return out;
  }

  _hasDisk(body, res) {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) if (this.diskIndex.has(`${body}:${res}:${ext}`)) return true;
    return false;
  }
}

export default TextureService;
