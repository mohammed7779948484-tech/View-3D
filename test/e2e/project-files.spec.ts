/** Issue M2-10: open, save, save as, save a copy, undo and redo, and the unsaved-changes prompt. */
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';

const FIXTURE = resolve(import.meta.dirname, '../fixtures/m1-document.json');
const FIXTURE_BYTES = readFileSync(FIXTURE);

let app: ElectronApplication | undefined;
let dir = '';
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'view3d-e2e-'));
});
test.afterEach(async () => {
  // Quitting skips the unsaved-changes prompt, so teardown never hangs; the app may already be gone.
  await app?.close().catch(() => undefined);
  app = undefined;
  rmSync(dir, { recursive: true, force: true });
});

/** A copy of the fixture in this test's own folder. */
function projectCopy(name = 'shop.json'): string {
  const path = join(dir, name);
  copyFileSync(FIXTURE, path);
  return path;
}
const readJson = (path: string): { id: string; name: string } => JSON.parse(readFileSync(path, 'utf8')) as { id: string; name: string };

type Counters = { __open?: number; __save?: number };
const stubOpen = (a: ElectronApplication, path: string | null): Promise<void> =>
  a.evaluate(({ dialog }, p) => {
    const g = globalThis as unknown as Counters;
    g.__open = 0;
    dialog.showOpenDialog = (async () => {
      g.__open = (g.__open ?? 0) + 1;
      return p === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [p] };
    }) as typeof dialog.showOpenDialog;
  }, path);
const stubSave = (a: ElectronApplication, path: string | null): Promise<void> =>
  a.evaluate(({ dialog }, p) => {
    const g = globalThis as unknown as Counters;
    g.__save = 0;
    dialog.showSaveDialog = (async () => {
      g.__save = (g.__save ?? 0) + 1;
      return p === null ? { canceled: true } : { canceled: false, filePath: p };
    }) as typeof dialog.showSaveDialog;
  }, path);
const calls = (a: ElectronApplication, which: '__open' | '__save'): Promise<number> =>
  a.evaluate((_electron, key) => (globalThis as unknown as Counters)[key] ?? 0, which);

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchApp();
  app = launched.app;
  return launched;
}
async function openProject(page: Page, a: ElectronApplication, path: string): Promise<void> {
  await stubOpen(a, path);
  await page.getByRole('button', { name: 'Open a project' }).click();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible();
}
async function rename(page: Page, name: string): Promise<void> {
  const box = page.getByRole('textbox', { name: 'Project name' });
  await box.fill(name);
  await box.press('Enter');
}
const title = (page: Page) => expect.poll(() => page.title());
const closeFirstWindow = (a: ElectronApplication): Promise<void> =>
  a.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.close();
  });

test('the bridge is narrow and the page has no Node', async () => {
  const { page } = await start();
  const shape = await page.evaluate(() => {
    const bridge = (globalThis as unknown as { view3d?: Record<string, unknown> }).view3d;
    return {
      keys: bridge === undefined ? null : Object.keys(bridge).sort(),
      types: bridge === undefined ? null : Object.values(bridge).map((v) => typeof v),
      require: typeof (globalThis as { require?: unknown }).require,
    };
  });
  expect(shape.keys).toEqual(['closeWindow', 'loadCatalog', 'onCloseRequested', 'openPascal', 'openProject', 'openScan', 'saveCatalog', 'saveProject']);
  expect(shape.types).toEqual(Array<string>(8).fill('function'));
  expect(shape.require).toBe('undefined');
});

test('a cancelled open leaves the start screen', async () => {
  const { page, app: a } = await start();
  await stubOpen(a, null);
  await page.getByRole('button', { name: 'Open a project' }).click();
  await expect.poll(() => calls(a, '__open')).toBe(1);
  await expect(page.getByRole('button', { name: 'Open a project' })).toBeVisible();
  expect(await page.title()).toBe('View-3D');
});

test('opening a project shows its name and the file name in the title', async () => {
  const { page, app: a } = await start();
  await openProject(page, a, projectCopy('shop.json'));
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Corner shop');
  await title(page).toBe('shop.json - View-3D');
});

test('save as writes the same bytes to the new file and takes its name', async () => {
  const { page, app: a } = await start();
  await openProject(page, a, projectCopy());
  const target = join(dir, 'second.json');
  await stubSave(a, target);
  await page.getByRole('button', { name: 'Save as', exact: true }).click();
  await expect.poll(() => (calls(a, '__save'))).toBe(1);
  await title(page).toBe('second.json - View-3D');
  expect(readFileSync(target).equals(FIXTURE_BYTES)).toBe(true);
});

test('save writes to the opened file without asking', async () => {
  const { page, app: a } = await start();
  const path = projectCopy();
  await openProject(page, a, path);
  await stubSave(a, join(dir, 'must-not-be-used.json'));
  await rename(page, 'Renamed shop');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => readJson(path).name).toBe('Renamed shop');
  expect(await calls(a, '__save')).toBe(0);
});

test('undo and redo go through the buttons', async () => {
  const { page, app: a } = await start();
  await openProject(page, a, projectCopy());
  const name = page.getByRole('textbox', { name: 'Project name' });
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await rename(page, 'Renamed shop');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(name).toHaveValue('Corner shop');
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(name).toHaveValue('Renamed shop');
});

test('save a copy writes a new project with a new id and opens it', async () => {
  const { page, app: a } = await start();
  const path = projectCopy();
  await openProject(page, a, path);
  const target = join(dir, 'copy.json');
  await stubSave(a, target);
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect.poll(() => (calls(a, '__save'))).toBe(1);
  await title(page).toBe('copy.json - View-3D');
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Corner shop (copy)');
  const copy = readJson(target);
  expect(copy.name).toBe('Corner shop (copy)');
  expect(copy.id).not.toBe(readJson(FIXTURE).id);
  expect(readFileSync(path).equals(FIXTURE_BYTES)).toBe(true);
});

test('a file that is not a project is explained and the start screen stays', async () => {
  const { page, app: a } = await start();
  const broken = join(dir, 'broken.json');
  writeFileSync(broken, 'not json at all');
  await stubOpen(a, broken);
  await page.getByRole('button', { name: 'Open a project' }).click();
  await expect(page.getByRole('alert')).toContainText('line 1');
  await expect(page.getByRole('button', { name: 'Open a project' })).toBeVisible();

  const newer = join(dir, 'newer.json');
  writeFileSync(newer, JSON.stringify({ ...readJson(FIXTURE), schemaVersion: 2 }));
  await stubOpen(a, newer);
  await page.getByRole('button', { name: 'Open a project' }).click();
  await expect(page.getByRole('alert')).toContainText('unsupported schemaVersion');
  await expect(page.getByRole('button', { name: 'Open a project' })).toBeVisible();
});

test('closing with unsaved changes asks first', async () => {
  const { page, app: a } = await start();
  await openProject(page, a, projectCopy());
  await rename(page, 'Renamed shop');

  await closeFirstWindow(a);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Close without saving?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(a.windows().length).toBe(1);

  const closed = page.waitForEvent('close');
  await closeFirstWindow(a);
  // This click closes the page, so the click itself may report the page as closed before it returns.
  // Only that is tolerated; the window must still close, which `closed` proves.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close without saving' })
    .click()
    .catch((error: unknown) => {
      if (!String(error).includes('has been closed')) throw error;
    });
  await closed;
  expect(a.windows().length).toBe(0);
});

test('closing right after undoing back to the saved state does not ask', async () => {
  const { page, app: a } = await start();
  await openProject(page, a, projectCopy());
  await rename(page, 'Renamed shop');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Corner shop');

  const closed = page.waitForEvent('close');
  await closeFirstWindow(a);
  await closed;
  expect(a.windows().length).toBe(0);
});

test('the close prompt can save and close', async () => {
  const { page, app: a } = await start();
  const path = projectCopy();
  await openProject(page, a, path);
  await rename(page, 'Saved on close');
  // The file is known, so no save dialog may be asked for.
  await stubSave(a, join(dir, 'must-not-be-used.json'));

  await closeFirstWindow(a);
  const closed = page.waitForEvent('close');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save and close', exact: true })
    .click({ timeout: 5000 })
    .catch((error: unknown) => {
      if (!String(error).includes('has been closed')) throw error;
    });
  await closed;
  expect(a.windows().length).toBe(0);
  expect(readJson(path).name).toBe('Saved on close');
  // The app has quit once its window closed, so ask the disk, not the app: the stubbed save dialog
  // would have written here.
  expect(existsSync(join(dir, 'must-not-be-used.json'))).toBe(false);
});
