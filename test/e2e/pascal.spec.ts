/** Phase 1 of docs/decisions/0008: Pascal's editor in a second window, offline, WebGPU first. */
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchApp } from './launch';

type Strings = { start: { pascal: string; typeWalls: string }; pascal: { noWebGpu: string }; walls: { title: string } };
const EN = resolve(import.meta.dirname, '../../app/renderer/i18n/en.json');

function english(): Strings {
  if (!existsSync(EN)) throw new Error(`English strings are missing: expected ${EN}`);
  const strings = JSON.parse(readFileSync(EN, 'utf8')) as Partial<Strings>;
  if (typeof strings.start?.pascal !== 'string') throw new Error('en.json has no start.pascal string (the start-screen button that opens Pascal)');
  if (typeof strings.pascal?.noWebGpu !== 'string') throw new Error('en.json has no pascal.noWebGpu string (the message shown without WebGPU)');
  return strings as Strings;
}

const PAGE_URL = 'view3d://app/pascal/index.html';
const SLOW = 60_000; // SwiftShader draws WebGPU in software; the first load is slow.

type Prefs = { contextIsolation?: boolean; nodeIntegration?: boolean; sandbox?: boolean };
const pascalPrefs = (app: ElectronApplication): Promise<Prefs | null> =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('view3d:'));
    // getLastWebPreferences exists at runtime but is missing from the Electron 45 typings.
    return win === undefined ? null : (win.webContents as unknown as { getLastWebPreferences(): Prefs }).getLastWebPreferences();
  });

let app: ElectronApplication | undefined;
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Clicks the start-screen Pascal button and returns the window it opens. */
async function openPascal(main: Page, strings: Strings): Promise<Page> {
  const opened = app!.waitForEvent('window', { timeout: SLOW });
  await main.getByRole('button', { name: strings.start.pascal, exact: true }).click();
  return opened;
}

test('opens Pascal\'s editor with the L-shaped test shop', async () => {
  test.setTimeout(120_000);
  const strings = english();
  const launched = await launchApp({ webgpu: true });
  app = launched.app;

  const pascal = await openPascal(launched.page, strings);
  const host = pascal.locator('[data-testid="pascal-host"]');
  await expect(host).toHaveAttribute('data-walls', '6', { timeout: SLOW });
  expect(pascal.url()).toBe(PAGE_URL);
  await expect(host).toHaveAttribute('data-unit', 'metric');

  const webgpuCanvases = await host.evaluate((el) =>
    [...el.querySelectorAll('canvas')].filter((c) => c.getContext('webgpu') !== null).length,
  );
  expect(webgpuCanvases).toBeGreaterThan(0);
  // Owner's decision: no textures in this batch (the Basis decoder needs eval, which the CSP forbids).
  await expect(host).toHaveAttribute('data-textures', 'false');

  // The main window stays open on its start screen.
  expect(app.windows().length).toBe(2);
  await expect(launched.page.getByRole('button', { name: strings.start.pascal, exact: true })).toBeVisible();
});

test('the Pascal window is locked down', async () => {
  test.setTimeout(120_000);
  const strings = english();
  const launched = await launchApp({ webgpu: true });
  app = launched.app;

  const pascal = await openPascal(launched.page, strings);
  await pascal.waitForLoadState('domcontentloaded');
  expect(pascal.url()).toMatch(/^view3d:/);

  const prefs = await pascalPrefs(app);
  expect(prefs).not.toBeNull();
  expect(prefs!.contextIsolation).toBe(true);
  expect(prefs!.nodeIntegration).toBe(false);
  expect(prefs!.sandbox).toBe(true);

  const types = await pascal.evaluate(() => {
    const g = globalThis as { require?: unknown; process?: unknown; module?: unknown; view3d?: unknown };
    return [typeof g.require, typeof g.process, typeof g.module, typeof g.view3d];
  });
  expect(types).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);

  const opened = await pascal.evaluate(() => (globalThis as unknown as { open(url: string): unknown }).open('https://example.com/'));
  expect(opened).toBeNull();
  const extra = await app.waitForEvent('window', { timeout: 1_000 }).catch(() => null);
  expect(extra).toBeNull();
  expect(app.windows().length).toBe(2);
});

test('no request leaves the computer while Pascal loads', async () => {
  test.setTimeout(150_000);
  const strings = english();
  const launched = await launchApp({ webgpu: true });
  app = launched.app;

  // The main process only uses onBeforeRequest, so onCompleted and onErrorOccurred are free to collect every request.
  await app.evaluate(({ session }) => {
    const seen: { url: string; error?: string }[] = [];
    (globalThis as { __requests?: typeof seen }).__requests = seen;
    const filter = { urls: ['<all_urls>'] };
    session.defaultSession.webRequest.onCompleted(filter, (details) => {
      seen.push({ url: details.url });
    });
    session.defaultSession.webRequest.onErrorOccurred(filter, (details) => {
      seen.push({ url: details.url, error: details.error });
    });
  });

  const consoleTexts: string[] = [];
  app.on('window', (w) => {
    w.on('console', (m) => consoleTexts.push(m.text()));
  });

  const pascal = await openPascal(launched.page, strings);
  await expect(pascal.locator('[data-testid="pascal-host"]')).toHaveAttribute('data-walls', '6', { timeout: SLOW });
  await pascal.waitForTimeout(5_000); // late loads: sounds and icons that start after the scene is up.

  const requests = await app.evaluate(() => (globalThis as { __requests?: { url: string; error?: string }[] }).__requests ?? []);
  expect(requests.length, 'the collectors saw no request at all').toBeGreaterThan(0);
  const remote = requests.map((r) => r.url).filter((u) => /^(https?|wss?):/i.test(u));
  expect(remote).toEqual([]);

  expect(consoleTexts.filter((t) => t.includes('Content Security Policy'))).toEqual([]);

  // Every local file Pascal asked for was found.
  expect(requests.filter((r) => r.error !== undefined && r.url.startsWith('view3d:'))).toEqual([]);
  // Owner's decision: no textures in this batch (the Basis decoder needs eval, which the CSP forbids), so neither the
  // texture files nor the decoder may be loaded. The main process's log is the evidence: the page's Resource Timing
  // does not record view3d:// loads (measured: its list stays empty while these load).
  const loaded = requests.filter((r) => r.error === undefined).map((r) => r.url);
  expect(loaded.filter((u) => u.includes('/material/'))).toEqual([]);
  expect(loaded.filter((u) => u.includes('/decoders/basis/'))).toEqual([]);

  const draco = await pascal.evaluate(async () => {
    const get = (globalThis as unknown as { fetch(u: string): Promise<{ ok: boolean }> }).fetch;
    const wasm = await get('view3d://app/decoders/draco/draco_decoder.wasm');
    const wrapper = await get('view3d://app/decoders/draco/draco_wasm_wrapper.js');
    return [wasm.ok, wrapper.ok];
  });
  expect(draco).toEqual([true, true]);
});

test('no error in the Pascal page or its workers', async () => {
  test.setTimeout(150_000);
  const strings = english();
  const launched = await launchApp({ webgpu: true });
  app = launched.app;

  const opened = app.waitForEvent('window', { timeout: SLOW });
  await launched.page.getByRole('button', { name: strings.start.pascal, exact: true }).click();
  const pascal = await opened;
  const pageErrors: string[] = [];
  pascal.on('pageerror', (e) => pageErrors.push(e.message));
  const cdp = await pascal.context().newCDPSession(pascal);
  await cdp.send('Log.enable');
  const logErrors: string[] = [];
  cdp.on('Log.entryAdded', (e) => {
    if (e.entry.level === 'error') logErrors.push(`${e.entry.source}: ${e.entry.text} ${e.entry.url ?? ''}`.trim());
  });

  await expect(pascal.locator('[data-testid="pascal-host"]')).toHaveAttribute('data-walls', '6', { timeout: SLOW });
  await pascal.waitForTimeout(8_000); // workers start late.

  expect(pageErrors).toEqual([]);
  expect(logErrors).toEqual([]);
});

test('without WebGPU: a clear message, and the 2D editor stays', async () => {
  const strings = english();
  // webgl false passes --disable-gpu --disable-software-rasterizer: requestAdapter() then returns null.
  const launched = await launchApp({ webgl: false });
  app = launched.app;
  const page = launched.page;

  await page.getByRole('button', { name: strings.start.pascal, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(strings.pascal.noWebGpu);
  const extra = await app.waitForEvent('window', { timeout: 2_000 }).catch(() => null);
  expect(extra).toBeNull();
  expect(app.windows().length).toBe(1);

  await page.getByRole('button', { name: strings.start.typeWalls, exact: true }).click();
  await expect(page.getByRole('heading', { name: strings.walls.title, exact: true })).toBeVisible({ timeout: 5_000 });
});
