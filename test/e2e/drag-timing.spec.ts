/**
 * Regression for the Windows CI failure of "dragging moves by the snapped delta and is one undo
 * step" (placement.spec.ts): the counter stayed at x = 2_000_000 after a drag to 3000 mm.
 * Cause: the plan keeps the drag in React state, so pointer events that arrive before React
 * re-renders read a stale value; the release then sees no movement and the drag is lost.
 * Here the whole gesture is dispatched in one synchronous task, so no re-render can happen between
 * the events. Expected values are the dragged-to points by hand (mm x 1000).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { protectedDoorway } from '../fixtures/rooms';
import { Harness, clickWorld, worldToScreen } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };

/** Dispatches down at `from`, optionally a move at `to`, and up at `to`, back to back in one evaluate. */
async function burst(
  page: Page,
  selector: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  withMove: boolean,
): Promise<void> {
  const a = await worldToScreen(page, from.x, from.y);
  const b = await worldToScreen(page, to.x, to.y);
  await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el === null) throw new Error('no element for ' + ${JSON.stringify(selector)});
    const ev = (type, x, y, buttons) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons }));
    ev('pointerdown', ${a.x}, ${a.y}, 1);
    ${withMove ? `ev('pointermove', ${b.x}, ${b.y}, 1);` : ''}
    ev('pointerup', ${b.x}, ${b.y}, 0);
  })()`);
}

async function placeCounter(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: 'Place Counter', exact: true }).click();
  await clickWorld(page, 2000, 2000);
  await expect(page.locator('[data-placement="p1"]')).toBeVisible(FIRST);
}

const centerOf = (doc: { placements: unknown[] }) => (doc.placements[0] as { center: unknown }).center;

for (const withMove of [true, false]) {
  const how = withMove ? 'down, move, up in one task' : 'down and up with no move in one task';

  test(`fixture drag survives events before a re-render: ${how}`, async () => {
    const page = await h.launch();
    await h.openRoom(protectedDoorway);
    await placeCounter(page);
    await burst(page, '[data-placement="p1"]', { x: 2000, y: 2000 }, { x: 3000, y: 2000 }, withMove);
    expect(centerOf(await h.saveAs())).toEqual({ x: 3_000_000, y: 2_000_000 });
  });

  test(`corner drag survives events before a re-render: ${how}`, async () => {
    const page = await h.launch();
    await h.openRoom(protectedDoorway);
    await expect(page.locator('[aria-label="Corner 2"]')).toBeVisible(FIRST);
    await burst(page, '[aria-label="Corner 2"]', { x: 7000, y: 0 }, { x: 7000, y: -500 }, withMove);
    const saved = await h.saveAs();
    expect(saved.room.outline).toEqual(
      protectedDoorway.outline.map((p, i) => (i === 1 ? { x: 7_000_000, y: -500_000 } : p)),
    );
  });
}
