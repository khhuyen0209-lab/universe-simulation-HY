// client/src/api/textureLoader.js
// Tải bản đồ hành tinh thật (ảnh) từ internet khi có mạng, lưu vào cache trình duyệt + Service Worker.
// Nếu chưa tải được (mất mạng / lỗi CORS / đang tải), fallback về texture canvas vẽ sẵn.
import * as THREE from 'three';

// Tải qua backend proxy (/api/texture/:body) để vượt CORS — chắc chắn tải được.
// Backend cache ảnh + trả header cache 30 ngày; SW + trình duyệt cache tiếp.
const apiBase = (typeof window !== 'undefined' && window.__API_BASE__ ? window.__API_BASE__ : '').replace(/\/+$/, '');
function textureUrl(key) { return `${apiBase}/api/texture/${key}`; }

const cache = new Map(); // cache trong bộ nhớ phiên làm việc

/**
 * Tải texture thật cho một thiên thể. Trả về Promise<Texture>.
 * Luôn resolve (không reject) — lỗi thì trả về fallbackCanvasTexture.
 */
export function loadBodyTexture(key, fallbackCanvasTexture) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const url = textureUrl(key);
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        cache.set(key, tex);
        resolve(tex);
      },
      undefined,
      () => resolve(fallbackCanvasTexture) // lỗi mạng -> dùng canvas
    );
  });
}
