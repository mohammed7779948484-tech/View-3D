/** Issue M2-11 (UI): import a RoomTrace scan, check what it did not know, decide the windows, use the room. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Harness } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const ROOT = resolve(import.meta.dirname, '../..');
const SAMPLE = join(ROOT, 'test/fixtures/scans/roomtrace-sample.json');
const ARABIC = 'العربية';

/** The corners and the window the Vitest suite expects from the sample (um); the app may differ by 2 um. */
const CORNERS = [
  { x: 0, y: 0 },
  { x: 4436121, y: 0 },
  { x: 4436121, y: 3163824 },
  { x: 3636733, y: 3025436 },
  { x: 2831120, y: 3025437 },
  { x: 2362624, y: 3075643 },
  { x: 0, y: 3291713 },
];

async function stubOpen(path: string): Promise<void> {
  await h.app!.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, path);
}
async function importScan(page: Page, path: string = SAMPLE): Promise<void> {
  await stubOpen(path);
  const button = page.getByRole('button', { name: 'Import a room scan' });
  await expect(button).toBeVisible(FIRST);
  await button.click();
}
async function review(page: Page, path: string = SAMPLE): Promise<void> {
  await importScan(page, path);
  await expect(page.getByRole('heading', { name: 'Check the scan' })).toBeVisible(FIRST);
}

const findings = (page: Page) => page.getByRole('list', { name: 'What the scan did not know' });
const sill = (page: Page) => page.getByRole('textbox', { name: 'Window sill height' });
const addWindow = (page: Page) => page.getByRole('button', { name: 'Add the window' });
const leaveOut = (page: Page) => page.getByRole('button', { name: 'Leave the window out' });
const useRoom = (page: Page) => page.getByRole('button', { name: 'Use this room' });

type Tree = { [key: string]: string | Tree };
function arabic(key: string): string {
  const path = join(ROOT, 'app/renderer/i18n/ar.json');
  if (!existsSync(path)) throw new Error(`${path} is missing`);
  let node: string | Tree | undefined = JSON.parse(readFileSync(path, 'utf8')) as Tree;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') throw new Error(`no string for key ${key} in ar.json`);
  return node;
}

test('the sample: review, decide the window, use the room, and the saved room is right', async () => {
  const page = await h.launch();
  await review(page);

  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
  const items = findings(page).getByRole('listitem');
  await expect(items).toHaveCount(5, FIRST);
  const text = (await items.allInnerTexts()).join('\n');
  expect(text).toContain('811 mm');
  expect(text).toContain('471 mm');
  expect(text.toLowerCase()).toContain('sill');
  await expect(useRoom(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();

  await sill(page).fill('90 cm');
  await addWindow(page).click();
  await expect(useRoom(page)).toBeEnabled();
  await useRoom(page).click();

  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
  await expect(page.getByRole('heading', { name: 'Check the scan' })).toBeHidden();
  await expect(page.getByRole('list', { name: 'Room problems' })).toContainText('no entrance', FIRST);

  const saved = await h.saveAs();
  expect(saved.room.outline).toHaveLength(7);
  saved.room.outline.forEach((p, i) => {
    expect(Math.abs(p.x - CORNERS[i]!.x), `corner ${i + 1} x`).toBeLessThanOrEqual(2);
    expect(Math.abs(p.y - CORNERS[i]!.y), `corner ${i + 1} y`).toBeLessThanOrEqual(2);
  });
  expect(saved.room.ceilingHeightUm).toBe(2_256_000);
  expect(saved.room.columns).toEqual([]);
  expect(saved.room.openings).toHaveLength(1);
  const o = saved.room.openings[0] as Record<string, unknown>;
  expect(Object.keys(o).sort()).toEqual(['heightUm', 'id', 'kind', 'offsetUm', 'sillHeightUm', 'wallIndex', 'widthUm']);
  expect(o).toMatchObject({ id: 'window-1', kind: 'window', wallIndex: 1, widthUm: 1_970_328, heightUm: 1_293_709, sillHeightUm: 900_000 });
  expect(Math.abs((o['offsetUm'] as number) - 614_403)).toBeLessThanOrEqual(2);
});

test('leaving the window out gives a room with no openings', async () => {
  const page = await h.launch();
  await review(page);
  await expect(useRoom(page)).toBeDisabled();
  await leaveOut(page).click();
  await expect(useRoom(page)).toBeEnabled();
  await useRoom(page).click();
  await expect(page.getByRole('list', { name: 'Room problems' })).toBeVisible(FIRST);
  const saved = await h.saveAs();
  expect(saved.room.openings).toEqual([]);
  expect(saved.room.outline).toHaveLength(7);
});

test('a window that would reach above the ceiling is refused and stays pending', async () => {
  const page = await h.launch();
  await review(page);
  await sill(page).fill('150 cm'); // 1500 + 1293.709 = 2793.709 mm > 2256 mm
  await addWindow(page).click();
  await expect(page.getByRole('alert')).toContainText('reaches 2794 mm above the floor, higher than the 2256 mm ceiling');
  await expect(useRoom(page)).toBeDisabled();
  await expect(sill(page)).toBeVisible();

  await sill(page).fill('90 cm');
  await addWindow(page).click();
  await expect(useRoom(page)).toBeEnabled();
});

test('a file that is not a readable RoomTrace scan is explained and the start screen stays', async () => {
  const page = await h.launch();
  const broken = join(h.dir, 'broken.json');
  writeFileSync(broken, 'not json');
  await importScan(page, broken);
  await expect(page.getByRole('alert')).toBeVisible(FIRST);
  await expect(page.getByRole('button', { name: 'Import a room scan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check the scan' })).toBeHidden();

  const newer = join(h.dir, 'newer.json');
  const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')) as Record<string, unknown>;
  writeFileSync(newer, JSON.stringify({ ...sample, schemaVersion: 3 }));
  await importScan(page, newer);
  await expect(page.getByRole('alert')).toBeVisible(FIRST);
  await expect(page.getByRole('alert')).not.toContainText('line 1');
  await expect(page.getByRole('button', { name: 'Import a room scan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check the scan' })).toBeHidden();
});

test('the bridge gains exactly one function, openScan', async () => {
  const page = await h.launch();
  const keys = await page.evaluate(() => {
    const bridge = (globalThis as unknown as { view3d?: Record<string, unknown> }).view3d;
    return bridge === undefined ? null : Object.keys(bridge).sort();
  });
  expect(keys).toEqual(['closeWindow', 'onCloseRequested', 'openProject', 'openScan', 'saveProject']);
});

test('in Arabic the review heading and the findings are in Arabic', async () => {
  const page = await h.launch();
  // English first, to know exactly which English lines must not appear.
  await review(page);
  const english = await findings(page).getByRole('listitem').allInnerTexts();
  expect(english).toHaveLength(5);
  await page.getByRole('button', { name: 'Back' }).click();

  const language = page.getByRole('combobox', { name: 'Language', exact: true });
  await expect(language).toBeVisible(FIRST);
  await language.selectOption({ label: ARABIC });
  await expect(page.getByRole('combobox', { name: 'اللغة', exact: true })).toBeVisible(FIRST);

  await importScan(page);
  await expect(page.getByRole('heading', { name: arabic('scan.title') })).toBeVisible(FIRST);
  await expect(page.getByRole('heading', { name: 'Check the scan' })).toBeHidden();
  const items = page.getByRole('listitem').filter({ hasText: /[؀-ۿ]/ });
  const shown = await items.allInnerTexts();
  expect(shown.length).toBeGreaterThanOrEqual(5);
  for (const line of shown) expect(english).not.toContain(line);

  // Each finding is the Arabic template for its code: every fixed piece of it is on screen.
  const all = shown.join('\n');
  for (const code of ['gap-filled', 'window-sill-unknown', 'no-doors', 'axes-assumed']) {
    const pieces = arabic(`scan.findings.${code}`).split(/\{\{[^}]*\}\}/).map((s) => s.trim()).filter((s) => s !== '');
    for (const piece of pieces) expect(all, `${code}: ${piece}`).toContain(piece);
  }
});
