/** Plan readability: doors, entrance, wall numbers, fixture names, and where the inspector and problems sit. */
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import type { DesignDocument } from '../../src/core/index';
import { Harness, clickWorld, um } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const product = (id: string) => seedProducts.find((p) => p.id === id)!;
const counter = product('nhf-c');
const gondola = product('nhf-g');

/** An 8 x 6 m room; entrance door 'door-1' on wall 0 (bottom), 350 cm along, 100 cm wide, swinging in. */
const doc: DesignDocument = {
  schemaVersion: 1,
  id: 'readability',
  name: 'Readability',
  room: {
    outline: [um(0, 0), um(8000, 0), um(8000, 6000), um(0, 6000)],
    ceilingHeightUm: 3_000_000,
    columns: [],
    openings: [
      {
        id: 'door-1',
        kind: 'door',
        wallIndex: 0,
        offsetUm: 3_500_000,
        widthUm: 1_000_000,
        heightUm: 2_100_000,
        sillHeightUm: 0,
        door: { isEntrance: true, swing: 'in', hinge: 'start' },
      },
    ],
  },
  products: [counter, gondola],
  placements: [
    { id: 'p1', productId: 'nhf-c', variantId: 'default', center: um(2000, 3000), rotationUdeg: 0 },
    { id: 'p2', productId: 'nhf-g', variantId: 'default', center: um(6000, 3000), rotationUdeg: 0 },
  ],
};

async function open(): Promise<import('@playwright/test').Page> {
  const page = await h.launch();
  await h.openDocument(doc);
  return page;
}

test('A1: an inward-swinging door shows its swing', async () => {
  const page = await open();
  await expect(page.locator('[data-door-swing="door-1"]')).toBeVisible(FIRST);
});

test('A2: the entrance is marked in words, in English and in Arabic', async () => {
  const page = await open();
  await expect(page.locator('[data-entrance="door-1"]')).toHaveText('Entrance', FIRST);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption({ label: 'العربية' });
  await expect(page.locator('[data-entrance="door-1"]')).toHaveText('المدخل', FIRST);
});

test('A3: each wall has its own number label; the length label keeps its text', async () => {
  const page = await open();
  await expect(page.locator('[data-wall-number="0"]')).toHaveText('1', FIRST);
  await expect(page.locator('[data-wall-number="1"]')).toHaveText('2', FIRST);
  await expect(page.locator('text.plan-length[data-wall="0"]')).toHaveText('800 cm', FIRST);
});

test('A4: neither the wall length label nor the wall number covers a door', async () => {
  const page = await open();
  const door = page.locator('[data-opening="door-1"]');
  await expect(door).toBeAttached(FIRST);
  const raw = (await door.boundingBox())!;
  // The door is a thin line (zero-height box): give it a 4 px margin so touching counts as covering.
  const b = { x: raw.x - 4, y: raw.y - 4, width: raw.width + 8, height: raw.height + 8 };
  for (const selector of ['text.plan-length[data-wall="0"]', '[data-wall-number="0"]']) {
    const label = page.locator(selector);
    await expect(label).toBeVisible(FIRST);
    const a = (await label.boundingBox())!;
    const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps, `${selector} ${JSON.stringify(a)} vs door ${JSON.stringify(b)}`).toBe(false);
  }
});

test('A5: each fixture shows its product name on the plan', async () => {
  const page = await open();
  const label = (id: string): Locator => page.locator(`[data-fixture-label="${id}"]`);
  await expect(label('p1')).toHaveText('Counter', FIRST);
  await expect(label('p2')).toHaveText('Gondola 4 feet', FIRST);
});

test('B1: the Selected fixture panel sits under the plan', async () => {
  const page = await open();
  await expect(page.locator('[data-placement="p1"]')).toBeVisible(FIRST);
  await clickWorld(page, 2000, 3000);
  await expect(
    page.locator('.plan-column').getByRole('heading', { name: 'Selected fixture' }),
  ).toBeVisible(FIRST);
});

test('B2: Layout problems sit under the plan', async () => {
  const page = await open();
  await expect(
    page.locator('.plan-column').getByRole('heading', { name: 'Layout problems' }),
  ).toBeVisible(FIRST);
});
