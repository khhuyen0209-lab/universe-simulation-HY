import { defineConfig } from 'vite';

// Khi dev, Vite chạy ở cổng 5173 và proxy /api, /health sang backend (cổng 10000).
// Khi build, mọi thứ được đóng gói vào client/dist và Express phục vụ chung -> không cần proxy.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:10000', changeOrigin: true },
      '/health': { target: 'http://localhost:10000', changeOrigin: true },
    },
  },
});
