import { defineConfig } from '@playwright/test';

// Playwright drives the Electron app (`_electron.launch`), so there are no browser projects.
// Specs are `*.spec.ts` under test/, so Vitest (`*.test.ts`) never picks them up.
export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.spec.ts',
  // One Electron app at a time: tests share the user-data folder and the display.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  outputDir: 'test-results',
  reporter: 'list',
  use: { trace: 'off' },
});
