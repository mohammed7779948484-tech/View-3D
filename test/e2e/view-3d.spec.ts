/** Issue M3-7: the 3D view of the open project. Boxes equal the document within 1 mm; expected numbers worked out by hand. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Placement } from '../../src/core/index';
import { angledWall } from '../fixtures/rooms';
import { testBin, testProducts, testTower, testWallShelf } from '../fixtures/products';
import { makeDoc } from '../rules/helpers';
import { Harness } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const TOL = 0.001; // 1 mm, in metres

type Box = { id: string; center: number[]; size: number[]; yawRad: number; problem: boolean };

const put = (id: string, product: typeof testBin, x: number, y: number, rotationUdeg: number): Placement => ({
  id,
  productId: product.id,
  variantId: product.variants[0]!.id,
  center: { x, y },
  rotationUdeg,
});

const tower = put('t', testTower, 6_731_672, 3_865_836, 116_565_051);
const shelf = put('s', testWallShelf, 3_000_000, 5_800_000, 180_000_000);
const bin = put('b', testBin, 2_000_000, 2_500_000, 30_000_000);
const bin2 = put('b2', testBin, 2_300_000, 2_500_000, 30_000_000);

const baseDoc = () => makeDoc(angledWall, testProducts, [tower, shelf, bin]);
const overlapDoc = () => makeDoc(angledWall, testProducts, [tower, shelf, bin, bin2]);

/** Product sizes in mm: width (local x), depth (local y), height. */
const SIZE_MM: Record<string, [number, number, number]> = {
  t: [600, 600, 1900],
  s: [1200, 400, 2100],
  b: [800, 800, 900],
  b2: [800, 800, 900],
};

async function describe(page: Page): Promise<Box[]> {
  // The canvas mounts its scene a moment after the click, so wait for the probe first.
  // A string, because the test project has no DOM types.
  await expect
    .poll(() => page.evaluate('typeof window.__view3dScene?.describe === "function"'), FIRST)
    .toBe(true);
  const r = (await page.evaluate(`window.__view3dScene.describe()`)) as { boxes: Box[] };
  return r.boxes;
}

async function show3d(page: Page): Promise<void> {
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.getByRole('button', { name: '3D view', exact: true })).toHaveAttribute('aria-pressed', 'true', FIRST);
  await expect.poll(async () => (await describe(page)).length, FIRST).toBeGreaterThan(0);
}

const twoPi = 2 * Math.PI;
const angleDiff = (a: number, b: number) => {
  const d = (((a - b) % twoPi) + twoPi) % twoPi;
  return Math.min(d, twoPi - d);
};

/** Scene corners (x, z) of a box: local plan offset (lx, ly) turned counter-clockwise by yaw, then z = -y. */
function corners(cx: number, cz: number, w: number, d: number, yaw: number): [number, number][] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([lx, ly]) => [cx + lx! * c - ly! * s, cz - (lx! * s + ly! * c)] as [number, number]);
}

test('3D view: each box has the placement centre, size and yaw within 1 mm; the angled-wall corners are right', async () => {
  const page = await h.launch();
  await h.openDocument(baseDoc());
  await expect(page.getByRole('button', { name: '2D plan', exact: true })).toHaveAttribute('aria-pressed', 'true', FIRST);
  await show3d(page);

  await expect(page.locator('svg[aria-label="Plan"]')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible(FIRST);
  await expect(page.getByRole('list', { name: 'Layout problems' })).toBeAttached(FIRST);

  const boxes = await describe(page);
  expect(boxes).toHaveLength(3);
  for (const p of [tower, shelf, bin]) {
    const b = boxes.find((x) => x.id === p.id)!;
    expect(b, `box ${p.id}`).toBeDefined();
    const [w, d, hh] = SIZE_MM[p.id]!;
    const want = [p.center.x / 1e6, hh! / 2000, -p.center.y / 1e6];
    for (let i = 0; i < 3; i++) expect(Math.abs(b.center[i]! - want[i]!)).toBeLessThan(TOL);
    const wantSize = [w! / 1000, hh! / 1000, d! / 1000];
    for (let i = 0; i < 3; i++) expect(Math.abs(b.size[i]! - wantSize[i]!)).toBeLessThan(TOL);
    expect(angleDiff(b.yawRad, (p.rotationUdeg / 1e6) * (Math.PI / 180))).toBeLessThan(1e-4);
  }

  // The tower's four corners, by hand, against the described box.
  const t = boxes.find((x) => x.id === 't')!;
  const yaw = (116.565051 * Math.PI) / 180;
  const hand = corners(6.731672, -3.865836, 0.6, 0.6, yaw);
  const drawn = corners(t.center[0]!, t.center[2]!, t.size[0]!, t.size[2]!, t.yawRad);
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(drawn[i]![0] - hand[i]![0])).toBeLessThan(TOL);
    expect(Math.abs(drawn[i]![1] - hand[i]![1])).toBeLessThan(TOL);
  }
  // Back-left corner, worked out by hand: (6731.672, 3865.836) mm + rotated (-300, -300) mm = + (402.492, -134.164) mm.
  expect(Math.abs(hand[0]![0] - 7.134164)).toBeLessThan(TOL);
  expect(Math.abs(hand[0]![1] - -3.731672)).toBeLessThan(TOL);
  expect(Math.abs(drawn[0]![0] - 7.134164)).toBeLessThan(TOL);
  expect(Math.abs(drawn[0]![1] - -3.731672)).toBeLessThan(TOL);
});

test('3D view: fixtures with a layout problem are red (problem true), the others are not, also after switching back and forth', async () => {
  const page = await h.launch();
  await h.openDocument(overlapDoc());
  await show3d(page);

  const check = async () => {
    await expect.poll(async () => (await describe(page)).length, FIRST).toBe(4);
    const boxes = await describe(page);
    const flag = (id: string) => boxes.find((b) => b.id === id)?.problem;
    expect(flag('b')).toBe(true);
    expect(flag('b2')).toBe(true);
    expect(flag('t')).toBe(false);
    expect(flag('s')).toBe(false);
  };
  await check();

  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
  await show3d(page);
  await check();
});

test('switching views and moving the camera never changes the document', async () => {
  const page = await h.launch();
  await h.openDocument(baseDoc());
  await h.saveAs();
  await show3d(page);
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await page.getByRole('button', { name: 'Corner view', exact: true }).click();
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
  await h.saveAs();
  expect(readFileSync(join(h.dir, 'saved-2.json'), 'utf8')).toBe(readFileSync(join(h.dir, 'saved-1.json'), 'utf8'));
});

test('without WebGL the 3D view says so and 2D keeps working', async () => {
  // --disable-gpu with --disable-software-rasterizer leaves no WebGL on any platform (see launch.ts).
  const page = await h.launch({ webgl: false });
  await h.openDocument(baseDoc());
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '3D is not available on this computer' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
});
