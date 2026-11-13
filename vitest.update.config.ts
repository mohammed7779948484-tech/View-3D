/** `pnpm snapshots:update`: rewrite the committed SVG snapshots. Review the diff afterwards. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/snapshots/rooms.test.ts', 'test/snapshots/layouts.test.ts', 'test/layout/golden.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    env: { UPDATE_SNAPSHOTS: '1' },
  },
});
