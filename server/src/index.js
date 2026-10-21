// server/src/index.js
// Entry point của backend. Express phục vụ:
//   - /health        : health check cho Render
//   - /api/*         : API dữ liệu thiên văn (proxy JPL Horizons + cache)
//   - /*             : static frontend build (client/dist) — deploy chung 1 dịch vụ
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import config from './config/index.js';
import CacheStore from './cache/cacheStore.js';
import healthRouter from './routes/health.js';
import createPositionsRouter from './routes/positions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// client/dist nằm ở <root>/client/dist khi build xong.
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const app = express();
app.disable('x-powered-by');

// CORS: chỉ cho phép các origin đã cấu hình. "*" hoặc rỗng = cho phép tất cả (dev).
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Origin khong duoc phep boi CORS.'));
  },
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

// Rate limit cơ bản để tránh bị quét / quá tải JPL.
if (config.rateLimitPerMinute > 0) {
  app.use(
    '/api/',
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.rateLimitPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Qua nhieu yeu cau, vui long thu lai sau.' },
    })
  );
}

// Cache RAM (TTL) + snapshot đĩa best-effort.
const cache = new CacheStore({ ttlMs: config.cacheTtlMs });

// Routes
app.use('/health', healthRouter);
app.use('/api', createPositionsRouter({ cache }));

// Proxy tải texture hành tinh (vượt CORS), cache RAM + header cache 30 ngày.
const TEXTURE_FILES = {
  sun: '2k_sun.jpg', mercury: '2k_mercury.jpg', venus: '2k_venus_surface.jpg',
  earth: '2k_earth_daymap.jpg', mars: '2k_mars.jpg', jupiter: '2k_jupiter.jpg',
  saturn: '2k_saturn.jpg', uranus: '2k_uranus.jpg', neptune: '2k_neptune.jpg',
};
const textureCache = new Map();
app.get('/api/texture/:body', async (req, res) => {
  const file = TEXTURE_FILES[req.params.body];
  if (!file) return res.status(404).json({ error: 'Khong tim thay texture.' });
  const cached = textureCache.get(file);
  if (cached) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.send(cached);
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    const r = await fetch(`https://www.solarsystemscope.com/textures/download/${file}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    clearTimeout(t);
    if (!r.ok) return res.status(502).json({ error: 'Khong tai duoc texture.' });
    const buf = Buffer.from(await r.arrayBuffer());
    textureCache.set(file, buf);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    res.send(buf);
  } catch {
    res.status(502).json({ error: 'Loi tai texture.' });
  }
});

// Phục vụ static frontend nếu đã build.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { maxAge: config.isProd ? '1h' : 0, index: 'index.html' }));
  // Fallback: mọi route không phải API trả về index.html (hỗ trợ refresh).
  app.get(/^\/(?!api|health).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .send(
        '<h1>Solar System 3D API</h1><p>Frontend chua duoc build. Chay <code>npm run build:client</code> tai thu muc goc.</p><p>API: <a href="/api/config">/api/config</a> | <a href="/api/positions">/api/positions</a> | <a href="/health">/health</a></p>'
      );
  });
}

// Xử lý lỗi tập trung.
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  const status = err.message && err.message.includes('CORS') ? 403 : 500;
  res.status(status).json({ error: config.isProd ? 'Loi server.' : err.message });
});

const server = app.listen(config.port, () => {
  console.log(`[server] Solar System 3D API dang chay tai http://localhost:${config.port}`);
  console.log(`[server] NODE_ENV=${config.nodeEnv}, cache TTL=${config.cacheTtlMs}ms, rate-limit=${config.rateLimitPerMinute}/phut`);
  if (!fs.existsSync(CLIENT_DIST)) {
    console.warn('[server] Khong tim thay client/dist — frontend se khong duoc phuc vu. Chay build:client.');
  }
});

// Tắt nhẹ nhàng.
process.on('SIGTERM', () => {
  console.log('[server] Nhan SIGTERM, dong server...');
  server.close(() => process.exit(0));
});

export default app;
