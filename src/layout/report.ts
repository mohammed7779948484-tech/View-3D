/** The "did not fit" sentences and the finished option for a built layout. */
import type { PlanningConfig } from '../rules/index';
import { validateLayout } from '../rules/index';
import type { LayoutOption, ReasonCode, Unplaced } from './types';
import { buildDocument, cmp } from './state';
import type { UnitGroup } from './state';
import { gridRows } from './island-grid';
import type { Built } from './island-grid';
import { measureAisles, score } from './score';
import { entranceInfo } from './walls';

export function reasonText(code: ReasonCode, config: PlanningConfig): string {
  const mm = (um: number): string => `${Math.round(um / 1000)} mm`;
  switch (code) {
    case 'unknown-size':
      return 'its dimensions are not known yet';
    case 'no-wall-long-enough':
      return 'no wall has a free stretch long enough for it';
    case 'outside-room':
      return 'it would not stand fully inside the shop';
    case 'column':
      return 'a column is in the way';
    case 'blocked-door':
      return 'it would block a door or the clear zone inside the entrance';
    case 'not-on-wall':
      return 'it must stand against a wall and the place is across a door';
    case 'overlap':
      return 'another fixture is already there';
    case 'window-blocked':
      return 'it is higher than the window sill it would stand in front of';
    case 'own-access':
      return `there is not enough aisle space left in front of it (at least ${mm(config.secondaryAisleUm)})`;
    case 'blocks-access':
      return 'it would block the aisle of a fixture that is already placed';
    case 'faces-door':
      return 'its aisle would run through the approach of a door';
    case 'unreachable':
      return 'it would cut part of the shop off from the entrance';
    case 'aisle-too-narrow':
      return `it would leave an aisle narrower than ${mm(config.secondaryAisleUm)}`;
    case 'main-aisle':
      return `it would narrow the main aisle to the counter below ${mm(config.mainAisleUm)}`;
    case 'needs-partner':
      return 'it is single-sided and there is neither free wall nor a partner to stand back to back with';
    case 'orphan':
      return 'it would stand alone, away from the rows, and no row has room for it';
  }
}

/**
 * The "did not fit" sentence: the cause most tried positions failed on first, then the next two,
 * each with its number of positions.
 */
export function describeObstacles(
  obstacles: Partial<Record<ReasonCode, number>>,
  tried: number,
  config: PlanningConfig,
): string {
  const ranked = (Object.entries(obstacles) as [ReasonCode, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .slice(0, 3);
  if (ranked.length === 0) return 'There was no wall or free floor left to try it on.';
  const head = `Tried ${tried} position${tried === 1 ? '' : 's'}.`;
  const parts = ranked.map(([code, n]) => `${reasonText(code, config)} (${n})`);
  if (tried === 1 || ranked.length === 1) return `${head} ${tried === 1 ? 'It' : 'They'} failed because ${parts[0]}.`;
  return `${head} Most failed because ${parts[0]}; then because ${parts.slice(1).join('; then because ')}.`;
}

export type RunResult = Omit<LayoutOption, 'rank'>;

/** The finished option for a built layout: document, score, rows, and what did not fit. */
export function report(built: Built, units: readonly UnitGroup[], unknown: readonly Unplaced[], final: boolean): RunResult {
  const { state, frame: f, strategy } = built;
  const { config } = state;
  const entrance = entranceInfo(state.room, state.walls);
  const unplaced: Unplaced[] = [...unknown];
  for (const { unit } of units) {
    const quantity = state.left.get(unit.key) ?? 0;
    if (quantity <= 0) continue;
    const entry = state.ledger.get(unit.key);
    const obstacles = Object.fromEntries([...(entry?.reasons ?? new Map<ReasonCode, number>())].sort((a, b) => cmp(a[0], b[0])));
    const tried = entry?.tried ?? 0;
    unplaced.push({
      productId: unit.product.id,
      variantId: unit.variant.id,
      name: unit.product.name,
      quantity,
      reason: describeObstacles(obstacles, tried, config),
      positionsTried: tried,
      obstacles,
    });
  }
  unplaced.sort((a, b) => cmp(`${a.productId}/${a.variantId}`, `${b.productId}/${b.variantId}`));

  const document = buildDocument(state, state.placed);
  // Every placement was checked on the way; the finished option is checked once more, in full,
  // by the same function that judges hand-made layouts.
  const leftover = final ? validateLayout(document, config) : [];
  if (leftover.length > 0) {
    // The engine checks every placement, so this is a programming error, not a user error.
    throw new Error(`autoLayout produced an invalid layout (${strategy.id}): ${leftover[0]!.message}`);
  }
  const requested = state.request.items.reduce((n, i) => n + Math.max(0, i.quantity), 0);
  const scoreBreakdown = score(state, f, entrance, requested);
  return {
    strategy,
    score: Math.round(scoreBreakdown.reduce((n, t) => n + t.points, 0) * 1000) / 1000,
    scoreBreakdown,
    document,
    unplaced,
    aisles: measureAisles(state, f),
    rows: gridRows(state, f).map((r) => ({ index: r.index, placementIds: r.members.map((p) => p.placement.id) })),
    cashWrap: state.cashWrap.map((p) => p.placement.id),
  };
}
