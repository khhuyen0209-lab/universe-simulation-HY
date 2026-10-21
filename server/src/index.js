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
import { TextureService, TEXTURE_MAP } from './services/textureService.js';

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

// Texture bản đồ hành tinh: proxy tải (không đặt UA browser -> tránh Cloudflare 403),
// cache RAM + đĩa, tự giải nén nếu file là ZIP, fallback 2k <-> 8k.
const textureService = new TextureService({
  cacheDir: config.texture.cacheDir,
  baseUrl: config.texture.baseUrl,
  timeoutMs: config.texture.timeoutMs,
});

// Routes
app.use('/health', healthRouter);
app.use('/api', createPositionsRouter({ cache }));

// Proxy tải texture hành tinh (vượt CORS). Hỗ trợ ?res=2k|8k (mặc định theo config).
// Nếu độ phân giải yêu cầu lỗi/không có (vd uranus/neptune không có 8k) -> tự fallback.
// Cache RAM + đĩa; header cache 1 năm (immutable). Nếu nguồn trả file ZIP -> tự giải nén.
app.get('/api/texture/:body', async (req, res) => {
  const body = (req.params.body || '').toLowerCase();
  if (!TEXTURE_MAP[body]) {
    return res.status(404).json({ error: 'Khong tim thay texture.', available: Object.keys(TEXTURE_MAP) });
  }
  const resAsked = req.query.res === '8k' ? '8k' : '2k';
  try {
    const { buf, mime, actualRes, source } = await textureService.get(body, resAsked);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Texture-Res', actualRes);
    res.setHeader('X-Texture-Source', source);
    return res.send(buf);
  } catch (err) {
    console.warn('[texture] loi tai', body, resAsked, ':', err.message);
    return res.status(502).json({ error: 'Khong tai duoc texture.', detail: config.isProd ? undefined : err.message });
  }
});

// Trạng thái cache texture (chẩn đoán).
app.get('/api/textures/status', (req, res) => {
  res.json({ defaultRes: config.texture.defaultRes, cache: textureService.status() });
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
  if (config.texture.prewarm) {
    console.log(`[server] Prewarm texture (${config.texture.defaultRes}) dang chay ngam...`);
    textureService.prewarm([config.texture.defaultRes]).catch((e) => console.warn('[server] prewarm texture co loi:', e.message));
  }
});

// Tắt nhẹ nhàng.
process.on('SIGTERM', () => {
  console.log('[server] Nhan SIGTERM, dong server...');
  server.close(() => process.exit(0));
});

export default app;
