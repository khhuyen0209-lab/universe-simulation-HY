// client/src/api/textureLoader.js
// Tải bản đồ hành tinh thật (ảnh) từ internet khi có mạng, lưu vào cache trình duyệt + Service Worker.
// Nếu chưa tải được (mất mạng / lỗi CORS / đang tải), fallback về texture canvas vẽ sẵn.
import * as THREE from 'three';

// Nguồn: Solar System Scope (miễn phí, 2K). Nếu CORS chặn, tự fallback canvas.
const BASE = 'https://www.solarsystemscope.com/textures/download/';
const TEXTURE_URLS = {
  sun: BASE + '2k_sun.jpg',
  mercury: BASE + '2k_mercury.jpg',
  venus: BASE + '2k_venus_surface.jpg',
  earth: BASE + '2k_earth_daymap.jpg',
  mars: BASE + '2k_mars.jpg',
  jupiter: BASE + '2k_jupiter.jpg',
  saturn: BASE + '2k_saturn.jpg',
  uranus: BASE + '2k_uranus.jpg',
  neptune: BASE + '2k_neptune.jpg',
};

const cache = new Map(); // cache trong bộ nhớ phiên làm việc

/**
 * Tải texture thật cho một thiên thể. Trả về Promise<Texture>.
 * Luôn resolve (không reject) — lỗi thì trả về fallbackCanvasTexture.
 */
export function loadBodyTexture(key, fallbackCanvasTexture) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const url = TEXTURE_URLS[key];
  if (!url) return Promise.resolve(fallbackCanvasTexture);
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
      () => resolve(fallbackCanvasTexture) // lỗi mạng/CORS -> dùng canvas
    );
  });
}
