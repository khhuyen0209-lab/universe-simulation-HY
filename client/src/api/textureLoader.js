// client/src/api/textureLoader.js
// Tải bản đồ hành tinh thật (ảnh) từ backend proxy (/api/texture/:body?res=2k|8k).
//   - Ưu tiên ảnh thật; nếu lỗi mạng / server 502 -> fallback về texture canvas vẽ sẵn.
//   - Độ phân giải: tự chọn theo thiết bị (mobile/3G -> 2k; desktop màn rộng -> 8k).
//     Có thể ép bằng window.__TEXTURE_RES__ (trong config.js) hoặc setTextureRes().
//   - Cache trong bộ nhớ phiên; trình duyệt + Service Worker cache tiếp (header 1 năm).
import * as THREE from 'three';

const apiBase = (typeof window !== 'undefined' && window.__API_BASE__ ? window.__API_BASE__ : '').replace(/\/+$/, '');

// Tự chọn độ phân giải. '8k' nét hơn nhưng file to (3–15 MB/hành tinh).
function detectRes() {
  if (typeof window === 'undefined') return '2k';
  // Ép cứng từ config.js (ưu tiên cao nhất).
  const forced = window.__TEXTURE_RES__;
  if (forced === '2k' || forced === '8k') return forced;
  // Mobile / màn nhỏ / tiết kiệm dữ liệu -> 2k.
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
  if (isMobile || smallScreen) return '2k';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && (conn.saveData || /2g|3g|slow/i.test(conn.effectiveType || ''))) return '2k';
  // Desktop màn đủ rộng -> 8k.
  return window.innerWidth >= 1280 ? '8k' : '2k';
}

let preferredRes = detectRes();

export function setTextureRes(res) {
  if (res === '2k' || res === '8k') {
    preferredRes = res;
    cache.clear(); // buộc tải lại với độ phân giải mới
  }
}
export function getTextureRes() { return preferredRes; }

function textureUrl(key) { return `${apiBase}/api/texture/${key}?res=${preferredRes}`; }

const cache = new Map(); // cache trong bộ nhớ phiên làm việc

/**
 * Tải texture thật cho một thiên thể. Trả về Promise<Texture>.
 * Luôn resolve (không reject) — lỗi thì trả về fallbackCanvasTexture.
 */
export function loadBodyTexture(key, fallbackCanvasTexture) {
  const cacheKey = `${key}:${preferredRes}`;
  if (cache.has(cacheKey)) return Promise.resolve(cache.get(cacheKey));
  const url = textureUrl(key);
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = preferredRes === '8k' ? 8 : 4;
        cache.set(cacheKey, tex);
        resolve(tex);
      },
      undefined,
      () => resolve(fallbackCanvasTexture) // lỗi mạng/server -> dùng canvas
    );
  });
}
