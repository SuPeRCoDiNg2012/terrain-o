import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      // The public site is the download page; the editor lives at /editor.html
      // and is the entry the desktop wrapper loads.
      input: {
        landing: 'index.html',
        editor: 'editor.html',
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/{geo,model,edit,io,dem,osm,persistence,classify,vectorize}/**/*.ts'],
      exclude: ['**/*.worker.ts', '**/*.test.ts'],
    },
  },
});
