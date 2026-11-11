/**
 * Spike: Playwright can drive an Electron app with a sandboxed, context-isolated window.
 * The toy app is plain JavaScript in test/spikes/electron-app.
 */
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { resolve } from 'node:path';

// Containers run as root, and Chromium refuses to start as root without --no-sandbox.
const rootArgs = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
const MAIN = resolve(import.meta.dirname, 'electron-app/main.cjs');

let app: ElectronApplication | undefined;
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

test('spike: electron app with preload bridge and locked-down window', async () => {
  app = await electron.launch({ args: [MAIN, ...rootArgs] });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('h1')).toHaveText('spike');
  expect(await page.evaluate(() => (globalThis as unknown as { api: { ping(): string } }).api.ping())).toBe('pong');
  expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined');
  expect(await page.evaluate(() => typeof (globalThis as { process?: unknown }).process)).toBe('undefined');

  // getLastWebPreferences exists at runtime but is missing from the Electron 45 typings.
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]!.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences(),
  );
  expect(prefs.sandbox).toBe(true);
  expect(prefs.contextIsolation).toBe(true);
  expect(prefs.nodeIntegration).toBe(false);
});
