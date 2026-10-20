// server/src/routes/positions.js
// Endpoint chính: trả vị trí 8 hành tinh tại một thời điểm.
// Chiến lược: RAM cache (TTL) -> gọi JPL song song -> nếu lỗi, trả stale cache
// với cờ cảnh báo -> nếu không có gì, trả 502 để client fallback Kepler.
import { Router } from 'express';
import { fetchAllEphemeris, normalizeTime, BODIES } from '../services/jplService.js';

export default function createPositionsRouter({ cache }) {
  const router = Router();

  // GET /api/positions?time=ISO-8601
  router.get('/positions', async (req, res) => {
    let normalized;
    try {
      normalized = normalizeTime(req.query.time);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const cacheKey = `positions:${normalized}`;

    // 1. Cache còn hạn -> trả ngay.
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        fromCache: true,
        cacheAgeSeconds: Math.round((Date.now() - new Date(cached.fetchedAt).getTime()) / 1000),
      });
    }

    // 2. Gọi JPL.
    try {
      const data = await fetchAllEphemeris(normalized);
      // Chỉ cache khi không có lỗi nào (hoặc cache một phần? để đơn giản: cache luôn,
      // client biết qua field partial/errors).
      cache.set(cacheKey, data);
      return res.json({ ...data, fromCache: false, cacheAgeSeconds: 0 });
    } catch (err) {
      // 3. Fallback: stale cache.
      const stale = cache.getStale(cacheKey);
      if (stale && stale.value) {
        return res.status(200).json({
          ...stale.value,
          fromCache: true,
          stale: true,
          staleReason: 'JPL_HORIZONS_UNAVAILABLE',
          upstreamError: err.message,
          cacheAgeSeconds: Math.round((Date.now() - new Date(stale.value.fetchedAt).getTime()) / 1000),
        });
      }
      // 4. Không có gì -> báo lỗi rõ ràng, client sẽ dùng mô hình Kepler cục bộ.
      return res.status(502).json({
        error: 'Khong the lay du lieu tu JPL Horizons va khong co cache.',
        upstreamError: err.message,
        hint: 'Client se chuyen sang mo hinh quyi dao Kepler tinh cuc bo.',
        requestedTime: normalized,
      });
    }
  });

  // GET /api/ephemeris/:body?time=ISO-8601 — một hành tinh duy nhất.
  router.get('/ephemeris/:body', async (req, res) => {
    const bodyKey = (req.params.body || '').toLowerCase();
    if (!BODIES[bodyKey]) {
      return res.status(400).json({ error: `Body khong hop le. Cac gia tri: ${Object.keys(BODIES).join(', ')}` });
    }
    let normalized;
    try {
      normalized = normalizeTime(req.query.time);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const cacheKey = `ephemeris:${bodyKey}:${normalized}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }
    try {
      const { fetchEphemeris } = await import('../services/jplService.js');
      const data = await fetchEphemeris(bodyKey, normalized);
      cache.set(cacheKey, data);
      return res.json({ ...data, fromCache: false });
    } catch (err) {
      const stale = cache.getStale(cacheKey);
      if (stale && stale.value) {
        return res.json({ ...stale.value, fromCache: true, stale: true, upstreamError: err.message });
      }
      return res.status(502).json({ error: 'JPL Horizons khong truy cap duoc.', upstreamError: err.message });
    }
  });

  // GET /api/config — metadata công khai, KHÔNG chứa bí mật.
  router.get('/config', (req, res) => {
    res.json({
      source: 'NASA/JPL Horizons',
      referenceFrame: 'ECLIPTIC_J2000',
      center: 'SUN (500@10)',
      units: { position: 'km', velocity: 'km/s' },
      syncIntervalMinutes: 30,
      availableBodies: Object.entries(BODIES).map(([key, b]) => ({ key, name: b.name, nameEn: b.nameEn })),
      note: 'Du lieu vi tri duoc proxy qua server de tranh CORS va duoc cache RAM TTL 30 phut.',
    });
  });

  return router;
}
