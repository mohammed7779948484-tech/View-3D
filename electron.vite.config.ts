import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Our folders are app/main and app/renderer (docs/ARCHITECTURE.md section 9), not electron-vite's
// default src/main and src/renderer, which would collide with the engine in src/.
export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('app/main/index.ts') } } },
  renderer: {
    root: resolve('app/renderer'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve('app/renderer/index.html') } },
  },
});
