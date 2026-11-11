/** Shared helpers for the 2D editor tests (issue M2-6): temp folders, dialog stubs, plan geometry. */
import { expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesignDocument, Point, Room } from '../../src/core/index';
import { launchApp } from './launch';

export type SavedDoc = {
  id: string;
  name: string;
  room: { outline: Point[]; ceilingHeightUm: number; columns: unknown[]; openings: unknown[] };
  products: unknown[];
  placements: unknown[];
};

/** One test's app and temp folder. Call `begin()` in beforeEach and `end()` in afterEach. */
export class Harness {
  app: ElectronApplication | undefined;
  page!: Page;
  dir = '';
  private saves = 0;

  begin(): void {
    this.dir = mkdtempSync(join(tmpdir(), 'view3d-editor-'));
    this.saves = 0;
  }
  async end(): Promise<void> {
    // Quitting skips the unsaved-changes prompt, so teardown never hangs; the app may already be gone.
    await this.app?.close().catch(() => undefined);
    this.app = undefined;
    rmSync(this.dir, { recursive: true, force: true });
  }
  async launch(options: { softwareGl?: boolean } = {}): Promise<Page> {
    const launched = await launchApp({ userDataDir: this.dir, ...options });
    this.app = launched.app;
    this.page = launched.page;
    return this.page;
  }

  /** Writes a project file holding `room` and opens it through the stubbed open dialog. */
  async openRoom(room: Room): Promise<void> {
    const doc = { schemaVersion: 1, id: 'room-test', name: 'Room test', room, products: [], placements: [] };
    await this.openFile(doc, 'room-test.json');
  }

  /** Writes a whole design document (room, products, placements) as a project file and opens it the same way. */
  async openDocument(doc: DesignDocument): Promise<void> {
    await this.openFile(doc, 'document-test.json');
  }

  private async openFile(doc: unknown, fileName: string): Promise<void> {
    const path = join(this.dir, fileName);
    writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
    await this.app!.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
    }, path);
    await this.page.getByRole('button', { name: 'Open a project' }).click();
    await expect(this.page.locator('svg[aria-label="Plan"]')).toBeVisible({ timeout: 5000 });
  }

  /** Clicks "Save as" into a fresh file and returns the parsed document. */
  async saveAs(): Promise<SavedDoc> {
    const path = join(this.dir, `saved-${++this.saves}.json`);
    await this.app!.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
    }, path);
    await this.page.getByRole('button', { name: 'Save as', exact: true }).click();
    await expect.poll(() => existsSync(path) && readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
    return JSON.parse(readFileSync(path, 'utf8')) as SavedDoc;
  }
}

export const um = (xMm: number, yMm: number): Point => ({ x: xMm * 1000, y: yMm * 1000 });

/** Where a world point (millimetres, y up) is on the screen, through the plan's own transform. */
export function worldToScreen(page: Page, xMm: number, yMm: number): Promise<{ x: number; y: number }> {
  // A string, because the test project has no DOM types.
  return page.evaluate(`(() => {
    const g = document.querySelector('svg[aria-label="Plan"] g[data-world]');
    if (g === null) throw new Error('no <g data-world> inside svg[aria-label="Plan"]');
    const p = new DOMPoint(${xMm}, ${yMm}).matrixTransform(g.getScreenCTM());
    return { x: p.x, y: p.y };
  })()`) as Promise<{ x: number; y: number }>;
}

export async function clickWorld(page: Page, xMm: number, yMm: number): Promise<void> {
  const p = await worldToScreen(page, xMm, yMm);
  await page.mouse.click(p.x, p.y);
}

/** Presses on the world point `from`, moves in `steps` pointer moves to `to`, and releases. */
export async function dragWorld(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
): Promise<void> {
  const a = await worldToScreen(page, from.x, from.y);
  const b = await worldToScreen(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  }
  await page.mouse.up();
}

export const unitSelect = (page: Page) => page.getByRole('combobox', { name: 'Unit' });
