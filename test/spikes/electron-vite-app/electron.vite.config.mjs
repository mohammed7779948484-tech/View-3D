import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

const here = import.meta.dirname;

export default {
  main: { build: { rollupOptions: { input: resolve(here, 'main/index.js') } } },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(here, 'preload/index.js'),
        // A sandboxed preload must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(here, 'renderer'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve(here, 'renderer/index.html') } },
  },
};
