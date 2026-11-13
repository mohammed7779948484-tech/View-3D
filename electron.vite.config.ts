import { cp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

// Our folders are app/main and app/renderer (docs/ARCHITECTURE.md section 9), not electron-vite's
// default src/main and src/renderer, which would collide with the engine in src/.

type IconSet = { prefix: string; width?: number; height?: number; icons: Record<string, unknown>; aliases?: Record<string, { parent: string }> };

/**
 * `virtual:pascal-icons`: only the Iconify icons Pascal uses (app/renderer/pascal/icon-names.json), taken from the
 * @iconify-json packages at build time, so the page never asks api.iconify.design. An unknown name fails the build.
 */
function pascalIcons(): Plugin {
  const id = 'virtual:pascal-icons';
  return {
    name: 'view3d-pascal-icons',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    async load(source) {
      if (source !== `\0${id}`) return undefined;
      const wanted = JSON.parse(await readFile(resolve('app/renderer/pascal/icon-names.json'), 'utf8')) as Record<string, string[] | string>;
      const sets: IconSet[] = [];
      for (const [prefix, names] of Object.entries(wanted)) {
        if (prefix.startsWith('_') || !Array.isArray(names)) continue;
        const full = JSON.parse(await readFile(resolve(`node_modules/@iconify-json/${prefix}/icons.json`), 'utf8')) as IconSet;
        const set: IconSet = { prefix, icons: {}, aliases: {} };
        if (full.width !== undefined) set.width = full.width;
        if (full.height !== undefined) set.height = full.height;
        for (const name of names) {
          const alias = full.aliases?.[name];
          const target = alias === undefined ? name : alias.parent;
          if (full.icons[target] === undefined) throw new Error(`pascal icons: ${prefix}:${name} is not in @iconify-json/${prefix}`);
          set.icons[target] = full.icons[target];
          if (alias !== undefined) set.aliases![name] = alias;
        }
        sets.push(set);
      }
      return `export const pascalIcons = ${JSON.stringify(sets)};`;
    },
  };
}

/** Three's Draco and Basis decoders, copied next to the page, so Pascal never loads them from gstatic or jsdelivr. */
function threeDecoders(): Plugin {
  return {
    name: 'view3d-three-decoders',
    apply: 'build',
    async writeBundle(options) {
      const out = options.dir ?? resolve('out/renderer');
      const libs = resolve('node_modules/three/examples/jsm/libs');
      for (const file of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) await cp(join(libs, 'draco', file), join(out, 'decoders', 'draco', file));
      for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) await cp(join(libs, 'basis', file), join(out, 'decoders', 'basis', file));
    },
  };
}

/** Pascal's editor imports `next/image` and three image-config internals; small shims replace them (decisions/0008). */
const shim = (file: string): string => resolve('app/renderer/pascal/shims', file);

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
    plugins: [react(), tailwindcss(), pascalIcons(), threeDecoders()],
    resolve: {
      alias: [
        // shadcn/ui components import from "@/..." (components.json).
        { find: '@', replacement: resolve('app/renderer') },
        { find: 'next/dist/shared/lib/image-config-context.shared-runtime', replacement: shim('image-config-context.ts') },
        { find: 'next/dist/shared/lib/image-config', replacement: shim('image-config.ts') },
        { find: 'next/dist/shared/lib/match-remote-pattern', replacement: shim('match-remote-pattern.ts') },
        { find: 'next/image', replacement: shim('next-image.tsx') },
      ],
      // One copy each: two copies of React, three or Pascal's stores would split their state.
      dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'zustand', '@iconify/react'],
    },
    // Pascal reads a few Next.js environment values; there is no `process` in the sandboxed page.
    define: { 'process.env.__NEXT_IMAGE_OPTS': 'undefined', 'process.env': '{}' },
    build: {
      rollupOptions: { input: { index: resolve('app/renderer/index.html'), pascal: resolve('app/renderer/pascal/index.html') } },
    },
  },
});
