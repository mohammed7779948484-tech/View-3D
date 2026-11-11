/**
 * Automatic layout: a deterministic, rule-based constructive placer with a small exhaustive
 * search over placement orders. No random numbers and no clock: the same request always gives
 * the same options, byte for byte.
 *
 * How it works (docs/decisions/0003-rule-based-layout-engine.md has the reasoning):
 *  1. The room is validated first; a bad room is reported and nothing is placed.
 *  2. Fixtures are placed in a fixed priority order:
 *     a. the checkout block: counter and glass showcases as one straight or L-shaped block,
 *        parallel to a wall with staff space behind, as near the entrance as the rules allow;
 *     b. single-sided units (wall shelving, towers, ...) along walls;
 *     c. islands on ONE grid of equally spaced row lines: double-sided gondolas, then
 *        single-sided units left over from the walls as back-to-back pairs, then other
 *        freestanding fixtures; a fixture left alone in a row is moved into a run or dropped.
 *  3. A position is accepted only if the layout still passes every validation rule: the local
 *     rules are checked directly and the walking rules by the same code `validateLayout` uses.
 *     Each finished option is checked once more with `validateLayout` itself.
 *  4. Search: every combination of counter wall, row direction, wall order, grid start side and
 *     island order (see SEARCH) is built in full; per counter wall and row direction the best
 *     is kept, scored with an inspectable weighted sum, and the options are ranked.
 *  5. Every rejected position is counted by reason; what could not be placed is reported with
 *     the causes most positions failed on.
 */
import type { LayoutItem, LayoutRequest, LayoutResult, LayoutStrategy, GridStart, IslandOrder, Unplaced, WallOrder } from './types';
import { adjacentRect, validateRoom } from '../rules/index';
import { bigFirst, cmp, COUNTER_WALLS_TRIED, DEFAULT_MAX_OPTIONS, dist, freshState } from './state';
import type { Unit, UnitGroup } from './state';
import { cashWrapPhase, placeCashWrap } from './cash-wrap';
import { centreGrid, islandPhase } from './island-grid';
import type { Built } from './island-grid';
import { report } from './report';
import type { RunResult } from './report';
import { SCORE_WEIGHTS } from './score';
import { entranceInfo, wallPhase } from './walls';

/** The placement orders the search tries for every counter wall and row direction. */
/** The two directions island rows are tried in, in this order. */
const ROW_DIRECTIONS = ['across', 'along'] as const;

export const SEARCH: { walls: WallOrder[]; start: GridStart[]; islands: IslandOrder[] } = {
  walls: ['back-first', 'front-first'],
  start: ['far', 'near'],
  islands: ['big-first', 'small-first'],
};

// ---------------------------------------------------------------------------------------------
// The requested fixtures, merged by product and variant

export function expandUnits(request: LayoutRequest): { units: UnitGroup[]; unknown: Unplaced[] } {
  const merged = new Map<string, { item: LayoutItem; quantity: number }>();
  for (const item of request.items) {
    const key = `${item.product.id}/${item.variantId}`;
    const entry = merged.get(key);
    if (entry === undefined) merged.set(key, { item, quantity: item.quantity });
    else entry.quantity += item.quantity;
  }
  const units: UnitGroup[] = [];
  const unknown: Unplaced[] = [];
  for (const key of [...merged.keys()].sort(cmp)) {
    const { item, quantity } = merged.get(key)!;
    if (quantity <= 0) continue;
    const variant = item.product.variants.find((v) => v.id === item.variantId);
    if (variant === undefined || variant.widthUm === null || variant.depthUm === null || variant.heightUm === null) {
      unknown.push({
        productId: item.product.id,
        variantId: item.variantId,
        name: item.product.name,
        quantity,
        reason: 'Its dimensions are not known yet, so it cannot be placed. Confirm the size first.',
        positionsTried: 0,
        obstacles: { 'unknown-size': quantity },
      });
      continue;
    }
    units.push({ unit: { product: item.product, variant, widthUm: variant.widthUm, depthUm: variant.depthUm, key }, quantity });
  }
  return { units, unknown };
}

// ---------------------------------------------------------------------------------------------
// Entry point

/** Walls worth trying for the checkout block: those where the counter can stand, best (near and facing the entrance) first. */
export function counterWalls(request: LayoutRequest, units: readonly UnitGroup[]): number[] {
  const counter = units.filter((g) => g.unit.product.placement === 'counter').sort(bigFirst)[0];
  if (counter === undefined) return [];
  const ranked: { index: number; value: number }[] = [];
  const probe = freshState(request, units);
  const entrance = entranceInfo(probe.room, probe.walls);
  const xs = request.room.outline.map((p) => p.x);
  const ys = request.room.outline.map((p) => p.y);
  // The longest distance across the room; a rough but orientation-independent yardstick.
  let span = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) span = Math.max(span, Math.hypot(xs[i]! - xs[j]!, ys[i]! - ys[j]!));
  for (const wall of probe.walls) {
    const state = freshState(request, units);
    if (!placeCashWrap(state, wall, [counter.unit], [], entrance)) continue;
    const placed = state.placed[0]!;
    const c = placed.rect.center;
    const d = dist(c, entrance.point);
    const front = adjacentRect(placed.rect, 'front', placed.rect.depthUm).center;
    const facing = d === 0 ? 0 : ((front.x - c.x) * (entrance.point.x - c.x) + (front.y - c.y) * (entrance.point.y - c.y)) / (Math.hypot(front.x - c.x, front.y - c.y) * d);
    const value = SCORE_WEIGHTS.counterNear * (1 - d / span) + SCORE_WEIGHTS.counterFacing * Math.max(0, facing);
    ranked.push({ index: wall.index, value: Math.round(value * 100) / 100 });
  }
  return ranked.sort((a, b) => b.value - a.value || a.index - b.index).slice(0, COUNTER_WALLS_TRIED).map((r) => r.index);
}

/**
 * Lay out the requested fixtures in the room. Returns ranked options (best first); each is a
 * complete design document that passes every validation rule, with its score explained and a
 * list of what did not fit and why. A room with problems gives no options and the problems.
 */
export type LayoutOptions = {
  /**
   * Called after each block of the search (one counter wall and one row direction), with the
   * blocks done so far and the total. It only reports; it never changes the result.
   */
  onProgress?: (done: number, total: number) => void;
};

export function autoLayout(request: LayoutRequest, options: LayoutOptions = {}): LayoutResult {
  const problems = validateRoom(request.room);
  if (problems.length > 0) return { options: [], problems };
  const { units, unknown } = expandUnits(request);
  const wallsForCounter: (number | null)[] = counterWalls(request, units);
  if (wallsForCounter.length === 0) wallsForCounter.push(null);

  const kept: RunResult[] = [];
  const total = wallsForCounter.length * ROW_DIRECTIONS.length;
  let done = 0;
  for (const counterWall of wallsForCounter) {
    const afterBlock = cashWrapPhase(request, units, counterWall);
    const afterWalls = new Map(SEARCH.walls.map((walls) => [walls, wallPhase(afterBlock, units, walls)]));
    for (const rows of ROW_DIRECTIONS) {
      // Search: build every combination of placement orders in full and keep the best.
      // Orders that cannot change anything are skipped: a wall order that gave the same walls as
      // an earlier one, and the second island order when there is nothing to re-order.
      let best: { built: Built; result: RunResult } | null = null;
      const wallSignatures = new Set<string>();
      for (const walls of SEARCH.walls) {
        const afterWall = afterWalls.get(walls)!;
        const wallSignature = JSON.stringify(afterWall.placed.map((p) => [p.unit.key, p.rect.center, p.rect.rotationUdeg]));
        if (wallSignatures.has(wallSignature)) continue;
        wallSignatures.add(wallSignature);
        const kinds = units.filter((g) => (afterWall.left.get(g.unit.key) ?? 0) > 0).length;
        for (const start of SEARCH.start) {
          for (const islands of kinds > 1 ? SEARCH.islands : SEARCH.islands.slice(0, 1)) {
            const id = `counter-${counterWall === null ? 'none' : `wall-${counterWall}`}_rows-${rows}`;
            const strategy: LayoutStrategy = {
              id,
              description: `${counterWall === null ? 'No counter' : `Checkout at wall ${counterWall + 1}`}; island rows run ${rows === 'across' ? 'from front to back' : 'parallel to the entrance wall'}.`,
              counterWall,
              rows,
              walls,
              start,
              islands,
            };
            const built = islandPhase(afterWall, units, strategy);
            const result = report(built, units, unknown, false);
            const better =
              best === null ||
              result.document.placements.length > best.result.document.placements.length ||
              (result.document.placements.length === best.result.document.placements.length && result.score > best.result.score);
            if (better) best = { built, result };
          }
        }
      }
      if (best !== null) {
        // Only the kept layout is centred (it is the costly step), then reported again.
        centreGrid(best.built.state, best.built.frame);
        kept.push(report(best.built, units, unknown, true));
      }
      done += 1;
      options.onProgress?.(done, total);
    }
  }

  const seen = new Set<string>();
  const results: RunResult[] = [];
  for (const result of kept) {
    const signature = JSON.stringify(result.document.placements.map((p) => [p.productId, p.variantId, p.center, p.rotationUdeg]).sort());
    if (seen.has(signature)) continue;
    seen.add(signature);
    results.push(result);
  }
  // Ranking: an option that places more of what was asked for always comes first; the score
  // decides between options that place the same number.
  results.sort(
    (a, b) =>
      b.document.placements.length - a.document.placements.length || b.score - a.score || cmp(a.strategy.id, b.strategy.id),
  );
  return {
    options: results.slice(0, request.maxOptions ?? DEFAULT_MAX_OPTIONS).map((r, i) => ({ rank: i + 1, ...r })),
    problems: [],
  };
}
