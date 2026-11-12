import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Our folders are app/main and app/renderer (docs/ARCHITECTURE.md section 9), not electron-vite's
// default src/main and src/renderer, which would collide with the engine in src/.
export default defineConfig({
  // Dependencies are bundled (not left in node_modules): the installer ships only out/ (electron-builder.yml).
  main: { build: { externalizeDeps: false, rollupOptions: { input: resolve('app/main/index.ts') } } },
  // A sandboxed preload must be one CommonJS file.
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: { input: resolve('app/preload/index.ts'), output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: resolve('app/renderer'),
    plugins: [react(), tailwindcss()],
    // shadcn/ui components import from "@/..." (components.json).
    resolve: { alias: { '@': resolve('app/renderer') } },
    build: { rollupOptions: { input: resolve('app/renderer/index.html') } },
  },
});
