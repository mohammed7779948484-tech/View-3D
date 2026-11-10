import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Snapshot files are written by tests; never run two files against the same output dir at once.
    fileParallelism: false,
    // Explicit, so a slow machine fails loudly and consistently instead of at Vitest's default.
    testTimeout: 60_000,
  },
});
