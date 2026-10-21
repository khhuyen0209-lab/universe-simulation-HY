// server/src/config/index.js
// Đọc và kiểm tra biến môi trường. Không bao giờ gửi các giá trị này ra client.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env nằm ở thư mục gốc của server (server/.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const toInt = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = {
  port: toInt(process.env.PORT, 10000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',

  // CORS: danh sách origin cách nhau bởi dấu phẩy. "*" hoặc rỗng = cho phép tất cả.
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jpl: {
    // JPL Horizons REST API (không cần API key).
    baseUrl: 'https://ssd.jpl.nasa.gov/api/horizons.api',
    timeoutMs: toInt(process.env.JPL_TIMEOUT_MS, 15000),
    maxRetries: toInt(process.env.JPL_MAX_RETRIES, 2),
  },

  cacheTtlMs: toInt(process.env.CACHE_TTL_MS, 30 * 60 * 1000), // mặc định 30 phút
  rateLimitPerMinute: toInt(process.env.RATE_LIMIT_PER_MINUTE, 60),
  // Texture bản đồ hành tinh (proxy + cache đĩa).
  texture: {
    // Độ phân giải mặc định khi client không gửi ?res=2k|8k. '2k' nhẹ, '8k' nét hơn.
    defaultRes: process.env.TEXTURE_DEFAULT_RES === '8k' ? '8k' : '2k',
    // Tải trước texture ở độ phân giải mặc định lúc khởi động (background, không chặn).
    prewarm: (process.env.TEXTURE_PREWARM || 'true') !== 'false',
    // Thư mục cache đĩa (bền qua restart, best-effort trên Render).
    cacheDir: process.env.TEXTURE_CACHE_DIR || path.resolve(__dirname, '../../.cache/textures'),
    // Timeout tải 1 file (8k to, cần nhiều thời gian hơn JPL).
    timeoutMs: toInt(process.env.TEXTURE_TIMEOUT_MS, 60000),
    baseUrl: process.env.TEXTURE_BASE_URL || 'https://www.solarsystemscope.com/textures/download/',
  },

  // URL công khai của backend, dùng khi frontend deploy riêng. Rỗng = cùng origin.
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),
};

export default config;
