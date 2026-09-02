import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // sockjs-client assumes a Node-style `global`; the browser only has `globalThis`.
  define: {
    global: 'globalThis',
  },
  server: {
    host: true,
    port: 5173,
    // Mirrors what nginx does in production, so the app is same-origin in both.
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'http://localhost:8080', changeOrigin: true, ws: true },
    },
  },
});
