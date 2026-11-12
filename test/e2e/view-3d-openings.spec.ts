/** M3 UX: the 3D walls open at doors and windows, and each fixture shows its product name. Expected numbers worked out by hand. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Opening, Placement, Room } from '../../src/core/index';
import { protectedDoorway } from '../fixtures/rooms';
import { testBin, testProducts } from '../fixtures/products';
import { makeDoc } from '../rules/helpers';
import { Harness } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const TOL = 0.001;

type Wall = { center: number[]; size: number[]; yawRad: number };

const mm = (v: number) => v * 1000;
const entrance: Opening = {
  id: 'entrance', kind: 'door', wallIndex: 0, offsetUm: mm(3500), widthUm: mm(1000), heightUm: mm(2100), sillHeightUm: 0,
  door: { isEntrance: true, swing: 'in', hinge: 'start' },
};
const win: Opening = { id: 'window-1', kind: 'window', wallIndex: 1, offsetUm: mm(2000), widthUm: mm(1500), heightUm: mm(1200), sillHeightUm: mm(900) };
// 7 m x 5 m, ceiling 3 m. Wall 0 is the bottom (plan y = 0, runs +x); wall 1 is the right (plan x = 7 m, runs +y).
const room: Room = { ...protectedDoorway, openings: [entrance, win] };

async function walls(page: Page): Promise<Wall[]> {
  await expect.poll(() => page.evaluate('typeof window.__view3dScene?.describe === "function"'), FIRST).toBe(true);
  const r = (await page.evaluate('window.__view3dScene.describe()')) as { walls?: Wall[] };
  expect(r.walls, 'describe() returns walls').toBeDefined();
  return r.walls!;
}

async function show3d(page: Page): Promise<void> {
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.getByRole('button', { name: '3D view', exact: true })).toHaveAttribute('aria-pressed', 'true', FIRST);
}

/** Is the scene point (x, y, z) inside the box, grown by `grow` metres on every side (negative shrinks)? Yaw turns about +y. */
function inside(w: Wall, p: [number, number, number], grow: number): boolean {
  const dx = p[0] - w.center[0]!;
  const dy = p[1] - w.center[1]!;
  const dz = p[2] - w.center[2]!;
  const c = Math.cos(w.yawRad);
  const s = Math.sin(w.yawRad);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= w.size[0]! / 2 + grow && Math.abs(dy) <= w.size[1]! / 2 + grow && Math.abs(lz) <= w.size[2]! / 2 + grow;
}

const covered = (ws: Wall[], p: [number, number, number]) => ws.some((w) => inside(w, p, TOL));
/** Thickness is not specified: try several distances across the wall line, 0 to 100 mm to either side. */
const ACROSS = [-0.1, -0.075, -0.05, -0.025, 0.025, 0.05, 0.075, 0.1];
/** Wall 0: plan (along, across) -> scene (along, height, -across). Wall 1: plan (7 + across, along) -> scene (7 + across, height, -along). */
const onWall0 = (along: number, height: number, across = 0): [number, number, number] => [along, height, -across];
const onWall1 = (along: number, height: number, across = 0): [number, number, number] => [7 + across, height, -along];
const holeFree = (ws: Wall[], at: (a: number, y: number, c: number) => [number, number, number], from: number, to: number, y0: number, y1: number) => {
  const hits: string[] = [];
  for (let a = from + 0.05; a < to; a += 0.1) for (let y = y0 + 0.05; y < y1; y += 0.1) for (const c of ACROSS) {
    if (ws.some((w) => inside(w, at(a, y, c), -TOL))) hits.push(`along ${a.toFixed(2)} height ${y.toFixed(2)} across ${c}`);
  }
  return hits;
};

test('V1: the wall has no piece in the entrance door opening, and is there beside and above the door', async () => {
  const page = await h.launch();
  await h.openDocument(makeDoc(room, testProducts, []));
  await show3d(page);
  const ws = await walls(page);
  expect(ws.length).toBeGreaterThan(0);
  for (const w of ws) {
    expect(w.size.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    expect(Number.isFinite(w.yawRad)).toBe(true);
  }
  // Door: 3.5 to 4.5 m along wall 0, 0 to 2.1 m high.
  expect(holeFree(ws, onWall0, 3.5, 4.5, 0, 2.1)).toEqual([]);
  // Beside the door, and above it up to the 3 m ceiling.
  expect(covered(ws, onWall0(1, 1)), 'wall at 1 m along, 1 m high').toBe(true);
  expect(covered(ws, onWall0(4, 2.5)), 'wall above the door at 4 m along, 2.5 m high').toBe(true);
});

test('V2: a window (sill 900 mm, height 1200 mm) leaves a hole from 0.9 to 2.1 m, with wall below and above', async () => {
  const page = await h.launch();
  await h.openDocument(makeDoc(room, testProducts, []));
  await show3d(page);
  const ws = await walls(page);
  // Window: 2.0 to 3.5 m along wall 1.
  expect(holeFree(ws, onWall1, 2.0, 3.5, 0.9, 2.1)).toEqual([]);
  expect(covered(ws, onWall1(2.75, 0.5)), 'wall below the sill').toBe(true);
  expect(covered(ws, onWall1(2.75, 2.5)), 'wall above the window').toBe(true);
  expect(covered(ws, onWall1(2.75, 1.5)), 'no wall at 1.5 m').toBe(false);
  expect(covered(ws, onWall1(1, 1.5)), 'wall beside the window').toBe(true);
});

test('V3: each fixture shows its product name in 3D', async () => {
  const page = await h.launch();
  const bin: Placement = { id: 'b', productId: testBin.id, variantId: testBin.variants[0]!.id, center: { x: 2_000_000, y: 2_500_000 }, rotationUdeg: 0 };
  await h.openDocument(makeDoc(room, testProducts, [bin]));
  await show3d(page);
  await expect(page.locator('[data-3d-label="b"]')).toHaveText(testBin.name, FIRST);
});
