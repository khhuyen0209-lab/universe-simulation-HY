// client/public/sw.js
// Service worker: hỗ trợ mở ứng dụng ngoại tuyến sau lần truy cập đầu tiên.
// Chiến lược:
//   - Static assets (JS/CSS/font/img): cache-first (lần đầu tải về, sau đó dùng cache).
//     Ba thư viện (three.js) được đóng gói vào bundle build -> offline thực sự, không phụ thuộc CDN.
//   - HTML (index.html): network-first, fallback cache.
//   - API (/api/*): network-first, fallback cache (chỉ dùng khi offline; dữ liệu API
//     không cache vô hạn — EphemerisAPI của app đã tự quản lý tuổi dữ liệu qua IndexedDB).
//   - KHÔNG cache POST.

const CACHE_STATIC = 'ss3d-static-v1';
const CACHE_RUNTIME = 'ss3d-runtime-v1';
const CACHE_API = 'ss3d-api-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(['./', './index.html'])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_RUNTIME, CACHE_API].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API: network-first, fallback cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_API).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // HTML: network-first.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Static assets: cache-first, fallback network và lưu cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
