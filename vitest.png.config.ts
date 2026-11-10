/** `pnpm snapshots:png`: render every committed SVG snapshot to a PNG under snapshots-png/ (not committed). */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/snapshots/png.export.ts'], testTimeout: 120_000 },
});
