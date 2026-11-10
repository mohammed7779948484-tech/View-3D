/** Issue M2-1: the Electron shell starts, shows the start screen, and is locked down. */
import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchApp } from './launch';

type Strings = { app: { title: string }; start: { noProject: string } };
const EN = resolve(import.meta.dirname, '../../app/renderer/i18n/en.json');

function english(): Strings {
  if (!existsSync(EN)) throw new Error(`English strings are missing: expected ${EN}`);
  return JSON.parse(readFileSync(EN, 'utf8')) as Strings;
}

type Prefs = { contextIsolation?: boolean; nodeIntegration?: boolean; sandbox?: boolean; webSecurity?: boolean };
const prefsOf = (app: ElectronApplication): Promise<Prefs> =>
  // getLastWebPreferences exists at runtime but is missing from the Electron 45 typings.
  app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]!.webContents as unknown as { getLastWebPreferences(): Prefs }).getLastWebPreferences(),
  );

let app: ElectronApplication | undefined;
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

test('starts on the start screen with no project open', async () => {
  const strings = english();
  const launched = await launchApp();
  app = launched.app;
  const page = launched.page;

  expect(await page.title()).toBe('View-3D');
  await expect(page.getByRole('heading', { name: 'View-3D' })).toBeVisible();
  await expect(page.getByText(strings.start.noProject, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('the window is locked down', async () => {
  const launched = await launchApp();
  app = launched.app;
  const prefs = await prefsOf(app);
  expect(prefs.contextIsolation).toBe(true);
  expect(prefs.nodeIntegration).toBe(false);
  expect(prefs.sandbox).toBe(true);
  expect(prefs.webSecurity).not.toBe(false);
  const types = await launched.page.evaluate(() => {
    const g = globalThis as { require?: unknown; process?: unknown; module?: unknown };
    return [typeof g.require, typeof g.process, typeof g.module];
  });
  expect(types).toEqual(['undefined', 'undefined', 'undefined']);
});

test('it never leaves the app', async () => {
  const launched = await launchApp();
  app = launched.app;
  const page = launched.page;

  // (a) a popup is refused and no second window appears.
  const opened = await page.evaluate(() => (globalThis as unknown as { open(url: string): unknown }).open('https://example.com/'));
  expect(opened).toBeNull();
  // A refused popup never fires a 'window' event; a leaking one would fire it within the wait.
  const extra = await app.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
  expect(extra).toBeNull();
  expect(app.windows().length).toBe(1);

  // (b) navigating away is refused.
  const before = page.url();
  await page.evaluate(() => {
    (globalThis as unknown as { location: { href: string } }).location.href = 'https://example.com/';
  });
  await page.waitForTimeout(500); // give a forbidden navigation time to start; there is no event to wait on.
  expect(page.url()).toBe(before);
  expect(page.url()).toMatch(/^file:\/\/.*\/index\.html$/);
});

test('it works offline: only local files load', async () => {
  const launched = await launchApp();
  app = launched.app;
  const page = launched.page;
  await page.waitForLoadState('load');

  const names = await page.evaluate(() => {
    const perf = (globalThis as unknown as { performance: { getEntriesByType(t: string): { name: string }[] } }).performance;
    return [...perf.getEntriesByType('navigation'), ...perf.getEntriesByType('resource')].map((e) => e.name);
  });
  expect(names.length).toBeGreaterThan(0);
  expect(names.filter((n) => !n.startsWith('file://'))).toEqual([]);

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");

  const outcome = await page.evaluate(() =>
    (globalThis as unknown as { fetch(u: string): Promise<unknown> }).fetch('https://example.com/').then(
      () => 'reached',
      () => 'blocked',
    ),
  );
  expect(outcome).toBe('blocked');
});
