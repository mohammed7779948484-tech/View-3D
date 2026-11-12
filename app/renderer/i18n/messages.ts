/**
 * Every message from the engine reaches the owner through here: worded by its code, in the chosen
 * language. Problem lengths are whole millimetres in both languages, as the engine words them.
 */
import type { TFunction } from 'i18next';
import type { CaptureProblem, SanityWarning } from '../../../src/capture/index';
import { formatDisplayLength } from '../../../src/core/index';
import type { AngleInputCode, DesignDocument, DisplayUnit, LengthInputCode, Room } from '../../../src/core/index';
import { captureConfig, defaultConfig } from '../../../src/rules/index';
import type { RoomProblem, Violation } from '../../../src/rules/index';
import type { ReasonCode, Unplaced } from '../../../src/layout/index';

const mm = (um: number | undefined): string => `${Math.round((um ?? 0) / 1000)} mm`;

/**
 * A length in the chosen unit for a sentence. In a right-to-left language it is wrapped in
 * Unicode isolates, so "350 cm" keeps its order inside Arabic text.
 */
export function lengthText(t: TFunction, um: number, unit: DisplayUnit): string {
  const text = formatDisplayLength(um, unit);
  return t('meta.dir') === 'rtl' ? `\u2066${text}\u2069` : text;
}

/** "Window", "Door" or "Entrance" for an opening, in the current language. */
function kindOf(t: TFunction, room: Room, id: string | undefined, lower: boolean): string {
  const o = room.openings.find((x) => x.id === id);
  const kind = o === undefined ? 'door' : o.kind === 'window' ? 'window' : o.door?.isEntrance === true ? 'entrance' : 'door';
  return t(`kinds.${lower ? 'lower' : 'upper'}.${kind}`);
}

export function problemText(t: TFunction, room: Room, p: RoomProblem): string {
  const v = p.values ?? {};
  const wall = p.index === undefined ? 0 : p.index + 1;
  const kind = kindOf(t, room, p.openingId, false);
  switch (p.code) {
    case 'opening-wall-missing':
      return t('problems.opening-wall-missing', { kind, id: p.openingId, wall: v['wallNumber'], wallCount: v['wallCount'] });
    case 'opening-off-wall':
      return v['overUm'] === undefined
        ? t('problems.opening-off-wall-position', { kind, id: p.openingId, wall })
        : t('problems.opening-off-wall', { kind, id: p.openingId, width: mm(v['widthUm']), offset: mm(v['offsetUm']), wall, length: mm(v['wallLengthUm']), over: mm(v['overUm']) });
    case 'openings-overlap':
      return t('problems.openings-overlap', { kind, id: p.openingId, other: kindOf(t, room, p.otherOpeningId, true), otherId: p.otherOpeningId, shared: mm(v['sharedUm']), wall });
    case 'opening-above-ceiling':
      return t('problems.opening-above-ceiling', { kind, id: p.openingId, top: mm(v['topUm']), ceiling: mm(v['ceilingUm']) });
    case 'column-outside-room':
      return t('problems.column-outside-room', { id: p.columnId });
    case 'no-entrance':
      return t('problems.no-entrance');
    default: {
      // Outline problems, with the wall or corner when known.
      const at = p.index === undefined ? '' : ` ${t(p.code === 'self-intersection' ? 'problems.atWall' : 'problems.atCorner', { n: p.index + 1 })}`;
      return `${t(`problems.${p.code}`)}${at}`;
    }
  }
}

export const lengthInputText = (t: TFunction, code: LengthInputCode): string => t(`input.${code}`);
export const angleInputText = (t: TFunction, code: AngleInputCode): string => t(`angleInput.${code}`);
export const captureProblemText = (t: TFunction, p: CaptureProblem): string => t(`capture.${p.code}`, { n: (p.index ?? 0) + 1 });

export function warningText(t: TFunction, w: SanityWarning): string {
  const limit =
    w.code === 'wall-very-short' ? `${captureConfig.shortWallUm / 1000} mm` : w.code === 'wall-very-long' ? `${captureConfig.longWallUm / 1_000_000} m` : '';
  return t(`warnings.${w.code}`, { n: w.index + 1, limit });
}

/**
 * A layout problem in words, in the chosen language, from its rule, `detail` and `values`. In English
 * it is exactly the engine's own message (in mm). Lengths are in `unit`. Fixtures are named `"name" (id)` as the engine names them.
 */
export function violationText(t: TFunction, doc: DesignDocument, v: Violation, unit: DisplayUnit = 'mm'): string {
  const label = (id: string | undefined): string => {
    if (id === undefined) return '';
    const placement = doc.placements.find((p) => p.id === id);
    const name = doc.products.find((p) => p.id === placement?.productId)?.name ?? placement?.productId ?? id;
    return `"${name}" (${id})`;
  };
  const value = (key: string): string => lengthText(t, v.values?.[key] ?? 0, unit);
  const ghost = doc.placements.find((p) => p.id === v.placementIds[0]);
  const opening = doc.room.openings.find((o) => o.id === v.openingId);
  return t(`violations.${v.rule}.${v.detail ?? 'default'}`, {
    a: label(v.placementIds[0]),
    b: label(v.placementIds[1]),
    id: v.placementIds[0],
    product: ghost?.productId,
    variant: ghost?.variantId,
    door: opening?.door?.isEntrance === true ? t('violations.theEntrance') : t('violations.door', { id: v.openingId }),
    window: v.openingId,
    column: v.columnId,
    height: value('heightUm'),
    sill: value('sillUm'),
    required: value('requiredUm'),
  });
}

/**
 * Why a product did not fit, in the chosen language, from the counts per reason. In English it is
 * exactly the engine's own sentence (`describeObstacles`): the three most frequent causes first.
 */
export function unplacedText(t: TFunction, u: Unplaced): string {
  const counts = Object.entries(u.obstacles) as [ReasonCode, number][];
  if (u.positionsTried === 0 && counts.length === 1 && counts[0]![0] === 'unknown-size') return t('unplaced.unknownSize');
  const ranked = counts
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 3);
  if (ranked.length === 0) return t('unplaced.nothingToTry');
  const sizes = { secondary: Math.round(defaultConfig.secondaryAisleUm / 1000), main: Math.round(defaultConfig.mainAisleUm / 1000) };
  const parts = ranked.map(([code, n]) => t('unplaced.part', { reason: t(`unplaced.reasons.${code}`, sizes), n }));
  const tried = u.positionsTried;
  const head = t(tried === 1 ? 'unplaced.triedOne' : 'unplaced.triedMany', { n: tried });
  if (tried === 1 || parts.length === 1) return `${head} ${t(tried === 1 ? 'unplaced.itFailed' : 'unplaced.theyFailed', { reason: parts[0] })}`;
  return `${head} ${t('unplaced.mostFailed', { first: parts[0], rest: parts.slice(1).join(t('unplaced.then')) })}`;
}
