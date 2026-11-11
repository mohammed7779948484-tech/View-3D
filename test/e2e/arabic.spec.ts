/** Issue M2-9: the app in Arabic, right to left, and back to English. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lShapeWithColumn } from '../fixtures/rooms';
import { Harness } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const ROOT = resolve(import.meta.dirname, '../..');
const I18N = join(ROOT, 'app/renderer/i18n');
const ARABIC = 'العربية';
const EASTERN_DIGITS = /[٠-٩]/;

type Tree = { [key: string]: string | Tree };
function loadTree(file: string): Tree {
  const path = join(I18N, file);
  if (!existsSync(path)) throw new Error(`${path} is missing: the Arabic strings have not been written yet`);
  return JSON.parse(readFileSync(path, 'utf8')) as Tree;
}
function lookup(tree: Tree, key: string): string {
  let node: string | Tree | undefined = tree;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') throw new Error(`no string for key ${key}`);
  return node;
}
function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_m, name: string) => String(vars[name] ?? `{{${name}}}`));
}
/** The Arabic string for `key`, read from ar.json at test time. */
const ar = (key: string, vars: Record<string, string | number> = {}): string => fill(lookup(loadTree('ar.json'), key), vars);

const languageBox = (page: Page, name: string) => page.getByRole('combobox', { name, exact: true });
async function toArabic(page: Page): Promise<void> {
  await expect(languageBox(page, 'Language')).toBeVisible(FIRST);
  await languageBox(page, 'Language').selectOption({ label: ARABIC });
  await expect(languageBox(page, 'اللغة')).toBeVisible(FIRST);
}
async function toEnglish(page: Page): Promise<void> {
  await languageBox(page, 'اللغة').selectOption({ label: 'English' });
  await expect(languageBox(page, 'Language')).toBeVisible(FIRST);
}
const html = (page: Page) => page.locator('html');

/** The plan's svg box, and where a world point (mm, y up) is on screen, whatever the language. */
async function planBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return (await page.locator('svg:has(g[data-world])').boundingBox())!;
}
function world(page: Page, xMm: number, yMm: number): Promise<{ x: number; y: number }> {
  return page.evaluate(`(() => {
    const g = document.querySelector('svg g[data-world]');
    if (g === null) throw new Error('no <g data-world> in an svg');
    const p = new DOMPoint(${xMm}, ${yMm}).matrixTransform(g.getScreenCTM());
    return { x: p.x, y: p.y };
  })()`) as Promise<{ x: number; y: number }>;
}
const bodyText = (page: Page): Promise<string> => page.evaluate('document.body.innerText') as Promise<string>;
const lines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter((l) => l !== '');

async function typeL(page: Page, lang: 'en' | 'ar'): Promise<void> {
  const name = (key: string, en: string, n?: number) => (lang === 'ar' ? ar(key, n === undefined ? {} : { n }) : en);
  const lengths = ['900', '400', '300', '300', '600', '700'];
  const angles = ['90', '90', '270', '90', '90', '90'];
  await page.getByRole('button', { name: name('start.typeWalls', 'Type the walls'), exact: true }).click();
  await expect(page.getByRole('textbox', { name: name('room.ceiling', 'Ceiling height'), exact: true })).toBeVisible(FIRST);
  await page.getByRole('textbox', { name: name('room.ceiling', 'Ceiling height'), exact: true }).fill('300');
  for (let i = 4; i < lengths.length; i++) await page.getByRole('button', { name: name('walls.add', 'Add a wall'), exact: true }).click();
  for (let i = 0; i < lengths.length; i++) {
    await page.getByRole('textbox', { name: name('walls.length', `Wall ${i + 1} length`, i + 1), exact: true }).fill(lengths[i]!);
    await page.getByRole('textbox', { name: name('walls.angle', `Wall ${i + 1} end angle`, i + 1), exact: true }).fill(angles[i]!);
  }
}

test('the language box switches the page between English left to right and Arabic right to left', async () => {
  const page = await h.launch();
  await expect(languageBox(page, 'Language')).toBeVisible(FIRST);
  await expect(languageBox(page, 'Language').locator('option')).toHaveText(['English', ARABIC]);
  await expect(html(page)).toHaveAttribute('lang', 'en');
  await expect(html(page)).toHaveAttribute('dir', 'ltr');

  await languageBox(page, 'Language').selectOption({ label: ARABIC });
  await expect(html(page)).toHaveAttribute('lang', 'ar');
  await expect(html(page)).toHaveAttribute('dir', 'rtl');
  await expect(languageBox(page, 'اللغة')).toBeVisible();
  for (const key of ['start.typeWalls', 'start.draw', 'start.open']) {
    await expect(page.getByRole('button', { name: ar(key), exact: true })).toBeVisible();
  }

  await languageBox(page, 'اللغة').selectOption({ label: 'English' });
  await expect(html(page)).toHaveAttribute('lang', 'en');
  await expect(html(page)).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('button', { name: 'Type the walls', exact: true })).toBeVisible();
});

test('the page is mirrored around the plan, the plan itself is not', async () => {
  const page = await h.launch();
  await h.openRoom(lShapeWithColumn);

  const ceilingEn = (await page.getByRole('textbox', { name: 'Ceiling height', exact: true }).boundingBox())!;
  const planEn = await planBox(page);
  expect(ceilingEn.x + ceilingEn.width).toBeLessThanOrEqual(planEn.x);
  const c1En = await world(page, 0, 0);
  const c2En = await world(page, 9000, 0);
  const c6En = await world(page, 0, 7000);
  expect(c2En.x).toBeGreaterThan(c1En.x);
  expect(c6En.y).toBeLessThan(c1En.y);

  await toArabic(page);
  const ceilingAr = (await page.getByRole('textbox', { name: ar('room.ceiling'), exact: true }).boundingBox())!;
  const planAr = await planBox(page);
  expect(ceilingAr.x).toBeGreaterThanOrEqual(planAr.x + planAr.width);
  const c1Ar = await world(page, 0, 0);
  const c2Ar = await world(page, 9000, 0);
  const c6Ar = await world(page, 0, 7000);
  expect(c2Ar.x).toBeGreaterThan(c1Ar.x);
  expect(c6Ar.y).toBeLessThan(c1Ar.y);
  // Relative to its own svg, Corner 2 sits at the same place in both languages.
  expect(Math.abs(c2Ar.x - planAr.x - (c2En.x - planEn.x))).toBeLessThanOrEqual(1);
  expect(Math.abs(c2Ar.y - planAr.y - (c2En.y - planEn.y))).toBeLessThanOrEqual(1);
});

test('numbers stay left to right with digits 0-9 in Arabic', async () => {
  const page = await h.launch();
  await h.openRoom(lShapeWithColumn);
  await toArabic(page);

  const label = page.locator('[data-wall="0"]');
  await expect(label).toHaveText('900 cm', FIRST);
  expect(await page.evaluate(`getComputedStyle(document.querySelector('[data-wall="0"]')).direction`)).toBe('ltr');

  const length = page.getByRole('textbox', { name: ar('walls.length', { n: 1 }), exact: true });
  await expect(length).toHaveValue('900 cm', FIRST);
  await expect(length).toHaveAttribute('dir', 'ltr');

  expect(EASTERN_DIGITS.test(await bodyText(page))).toBe(false);
});

test('nothing is left in English when the app is in Arabic', async () => {
  const page = await h.launch();
  const en = flattenValues(loadTree('en.json'));
  const arMap = flattenValues(loadTree('ar.json'));
  const sameInBoth = new Set([...en].filter(([k, v]) => arMap.get(k) === v).map(([, v]) => v));
  const english = new Set([...en.values()].filter((v) => !sameInBoth.has(v)));
  // Language names are written in their own language; numbers and units carry no words.
  const exempt = (line: string) => line === 'English' || /^[\d\s.,'"°+-]*(mm|cm|m|in|ft|ft-in)?$/.test(line);
  const check = async (where: string) => {
    for (const line of lines(await bodyText(page))) {
      if (exempt(line)) continue;
      expect(english.has(line), `${where}: "${line}" is an English string`).toBe(false);
      expect(/Wall |Door /.test(line), `${where}: "${line}" has an English word`).toBe(false);
    }
  };

  await toArabic(page);
  await check('start screen');

  await page.getByRole('button', { name: ar('start.typeWalls'), exact: true }).click();
  await expect(page.getByRole('textbox', { name: ar('room.ceiling'), exact: true })).toBeVisible(FIRST);
  await check('the walls screen');
  await page.getByRole('button', { name: ar('common.back'), exact: true }).click();

  await toEnglish(page);
  await h.openRoom(lShapeWithColumn);
  await toArabic(page);
  await page.getByRole('button', { name: ar('openings.addDoor'), exact: true }).click();
  await expect(page.getByRole('textbox', { name: ar('openings.door.wall'), exact: true })).toBeVisible(FIRST);
  await check('the project screen with the door form');
});

function flattenValues(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    if (typeof v === 'string') out.set(path, v);
    else for (const [p, leaf] of flattenValues(v, path)) out.set(p, leaf);
  }
  return out;
}

test('room problems are translated from their codes, with their numbers filled in', async () => {
  const page = await h.launch();
  await h.openRoom({ ...lShapeWithColumn, columns: [], openings: lShapeWithColumn.openings.filter((o) => o.id === 'window-1') });
  await toArabic(page);

  const list = page.getByRole('list', { name: ar('room.problems'), exact: true });
  await expect(list).toContainText(ar('problems.no-entrance'), FIRST);

  await page.getByRole('button', { name: ar('openings.addDoor'), exact: true }).click();
  const field = (key: string) => page.getByRole('textbox', { name: ar(key), exact: true });
  await field('openings.door.wall').fill('1');
  await field('openings.door.offset').fill('850');
  await field('openings.door.width').fill('100');
  await field('openings.door.height').fill('210');
  await page.getByRole('combobox', { name: ar('openings.door.swing'), exact: true }).selectOption({ label: ar('openings.door.swingIn') });
  await page.getByRole('button', { name: ar('openings.door.add'), exact: true }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('500 mm', FIRST);
  const text = (await alert.innerText()).replace(/\n/g, ' ');
  // Every fixed piece of the Arabic template is there, and no {{placeholder}} was left unfilled.
  for (const piece of ar('problems.opening-off-wall').split(/\{\{[^}]*\}\}/)) {
    if (piece.trim() !== '') expect(text, `missing "${piece}"`).toContain(piece.trim());
  }
  expect(text).not.toContain('{{');
  // No English words; ids such as door-1 are data, not words.
  const letters = text.replace(/\b(door|window|column)-\d+\b/g, '').match(/[A-Za-z]{4,}/g) ?? [];
  expect(letters.filter((w) => w !== 'View')).toEqual([]);
});

for (const lang of ['en', 'ar'] as const) {
  test(`screenshots for the owner in ${lang === 'ar' ? 'Arabic' : 'English'}`, async () => {
    const dir = join(ROOT, 'test-results', 'screens');
    mkdirSync(dir, { recursive: true });
    const page = await h.launch();
    await expect(languageBox(page, 'Language')).toBeVisible(FIRST);
    const shot = async (name: string) => {
      const path = join(dir, `${lang}-${name}.png`);
      await page.screenshot({ path });
      expect(existsSync(path) && statSync(path).size > 0, `${path} was not written`).toBe(true);
    };
    if (lang === 'ar') await toArabic(page);
    await shot('start');

    await typeL(page, lang);
    await shot('walls');
    await page.getByRole('button', { name: lang === 'ar' ? ar('common.back') : 'Back', exact: true }).click();

    if (lang === 'ar') await toEnglish(page);
    await h.openRoom(lShapeWithColumn);
    if (lang === 'ar') await toArabic(page);
    await expect(page.locator('[data-wall="0"]')).toHaveText('900 cm', FIRST);
    await shot('project');
  });
}
