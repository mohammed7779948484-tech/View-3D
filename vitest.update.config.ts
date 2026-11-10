/** `pnpm snapshots:update`: rewrite the committed SVG snapshots. Review the diff afterwards. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/snapshots/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    env: { UPDATE_SNAPSHOTS: '1' },
  },
});
