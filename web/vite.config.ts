import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backend = 'http://localhost:3000';

// The admin page is served by Nest under /export-excel (see
// src/export/web-assets.ts); `npm run build` writes it to dist/web.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/export-excel/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/export-excel/api': backend,
      '/export-excel/download': backend,
    },
  },
});
