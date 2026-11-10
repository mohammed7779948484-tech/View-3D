import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Snapshot files are written by tests; never run two files against the same output dir at once.
    fileParallelism: false,
  },
});
