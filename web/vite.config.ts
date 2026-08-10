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
  },
});
