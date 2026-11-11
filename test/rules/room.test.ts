/** A bad room must be named as the problem, never answered with "0 fixtures fit". */
import { describe, expect, it } from 'vitest';
import type { Opening, Room } from '../../src/core/index';
import { autoLayout } from '../../src/layout/index';
import { normalizeOutline, validateLayout, validateRoom } from '../../src/rules/index';
import { testCounterLong, testGondolaDouble, testProducts, testWallShelf } from '../fixtures/products';
import { lShapeWithColumn } from '../fixtures/rooms';
import { makeDoc, mm, place, pt, rectRoom } from './helpers';

const good = rectRoom(6000, 6000); // entrance x 2500..3500 on wall 0
const door = (id: string, wallIndex: number, offsetMm: number, widthMm: number, isEntrance: boolean): Opening => ({
  id, kind: 'door', wallIndex, offsetUm: mm(offsetMm), widthUm: mm(widthMm), heightUm: mm(2100), sillHeightUm: 0,
  door: { isEntrance, swing: 'in', hinge: 'start' },
});
const codes = (room: Room): string[] => validateRoom(room).map((p) => p.code);
const items = [{ product: testCounterLong, variantId: 'default', quantity: 1 }, { product: testWallShelf, variantId: 'default', quantity: 2 }];
const layout = (room: Room) => autoLayout({ id: 'r', name: 'r', room, items });

describe('validateRoom', () => {
  it('accepts a sound room', () => {
    expect(validateRoom(good)).toEqual([]);
  });

  it('clockwise outline', () => {
    const room = { ...good, outline: [...good.outline].reverse() };
    expect(codes(room)).toEqual(['clockwise']);
    expect(validateRoom(room)[0]!.message).toMatch(/clockwise/i);
  });

  it('duplicate corner', () => {
    const room = { ...good, outline: [pt(0, 0), pt(6000, 0), pt(6000, 0), pt(6000, 6000), pt(0, 6000)] };
    expect(codes(room)).toEqual(['zero-length-edge']);
  });

  it('bow-tie (self-intersecting) outline', () => {
    const room = { ...good, outline: [pt(0, 0), pt(6000, 6000), pt(6000, 0), pt(0, 6000)] };
    expect(codes(room)).toContain('self-intersection');
  });

  it('entrance overhanging the end of its wall', () => {
    const room = { ...good, openings: [door('entrance', 0, 5500, 1000, true)] };
    const problems = validateRoom(room);
    expect(problems.map((p) => p.code)).toEqual(['opening-off-wall']);
    expect(problems[0]!.openingId).toBe('entrance');
    expect(problems[0]!.message).toMatch(/500 mm/); // by how much it overhangs
  });

  it('opening wider than its wall', () => {
    const room = { ...good, openings: [door('entrance', 0, 0, 7000, true)] };
    expect(codes(room)).toEqual(['opening-off-wall']);
  });

  it('overlapping doors on one wall', () => {
    const room = { ...good, openings: [door('entrance', 0, 2500, 1000, true), door('side', 0, 3200, 900, false)] };
    const problems = validateRoom(room);
    expect(problems.map((p) => p.code)).toEqual(['openings-overlap']);
    expect([problems[0]!.openingId, problems[0]!.otherOpeningId]).toEqual(['entrance', 'side']);
  });

  it('doors that only touch do not overlap', () => {
    const room = { ...good, openings: [door('entrance', 0, 2500, 1000, true), door('side', 0, 3500, 900, false)] };
    expect(validateRoom(room)).toEqual([]);
  });

  it('no entrance', () => {
    const room = { ...good, openings: [door('side', 0, 2500, 1000, false)] };
    expect(codes(room)).toEqual(['no-entrance']);
    expect(validateRoom(room)[0]!.message).toMatch(/entrance/i);
  });

  it('several entrances are allowed', () => {
    const room = { ...good, openings: [door('entrance', 0, 2500, 1000, true), door('second', 2, 2500, 1000, true)] };
    expect(validateRoom(room)).toEqual([]);
  });
});

describe('validateRoom: openings above the ceiling and columns outside the room', () => {
  // L room: ceiling 3000 mm, entrance (top 2100 mm) on wall 0, window-1 on wall 5 (offset 2500, width 2000, sill 900, height 1200).
  const l = lShapeWithColumn;
  const withWindow = (sillMm: number, heightMm: number, extra: Partial<Opening> = {}): Room => ({
    ...l,
    openings: l.openings.map((o) => (o.id === 'window-1' ? { ...o, sillHeightUm: mm(sillMm), heightUm: mm(heightMm), ...extra } : o)),
  });
  const column = (id: string, x0: number, y0: number, x1: number, y1: number) => ({ id, outline: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)] });
  const withColumns = (...extra: ReturnType<typeof column>[]): Room => ({ ...l, columns: [...l.columns, ...extra] });

  it('the fixture as it is has no problems', () => {
    expect(validateRoom(l)).toEqual([]);
  });

  it('a window reaching above the ceiling is reported with its heights', () => {
    const problems = validateRoom(withWindow(2000, 1200)); // top 3200 mm, ceiling 3000 mm
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'opening-above-ceiling', openingId: 'window-1', index: 5 });
    expect(problems[0]!.message).toContain('3200 mm');
    expect(problems[0]!.message).toContain('3000 mm');
    expect(problems[0]!.message).toContain('window-1');
  });

  it('a top exactly at the ceiling is fine, one micrometre above is not', () => {
    expect(codes(withWindow(1800, 1200))).toEqual([]); // top 3 000 000 um
    const room: Room = { ...l, openings: l.openings.map((o) => (o.id === 'window-1' ? { ...o, sillHeightUm: 1_800_001, heightUm: 1_200_000 } : o)) };
    expect(codes(room)).toEqual(['opening-above-ceiling']);
  });

  it('a door taller than a low ceiling is reported, in opening order', () => {
    const problems = validateRoom({ ...l, ceilingHeightUm: mm(2000) });
    expect(problems.map((p) => [p.code, p.openingId])).toEqual([
      ['opening-above-ceiling', 'entrance'],
      ['opening-above-ceiling', 'window-1'],
    ]);
  });

  it('an opening already off its wall is not also reported above the ceiling', () => {
    const problems = validateRoom(withWindow(2000, 1200, { offsetUm: mm(6000) })); // 6000 + 2000 > wall 5 length 7000
    expect(problems.map((p) => [p.code, p.openingId])).toEqual([['opening-off-wall', 'window-1']]);
  });

  it('a column crossing the right wall is reported', () => {
    const problems = validateRoom(withColumns(column('c2', 8800, 1000, 9200, 1400)));
    expect(problems.map((p) => p.code)).toEqual(['column-outside-room']);
    expect(problems[0]).toMatchObject({ columnId: 'c2' });
    expect(problems[0]!.message).toContain('c2');
  });

  it('a column wholly in the missing corner of the L is reported', () => {
    const problems = validateRoom(withColumns(column('c3', 7000, 5000, 7400, 5400)));
    expect(problems.map((p) => p.code)).toEqual(['column-outside-room']);
    expect(problems[0]).toMatchObject({ columnId: 'c3' });
  });

  it('a column touching a wall from inside is fine', () => {
    expect(codes(withColumns(column('c4', 8600, 1000, 9000, 1400)))).toEqual([]);
  });

  it('a column crossing the inner wall into the notch is reported', () => {
    const problems = validateRoom(withColumns(column('c5', 5800, 4400, 6200, 4800)));
    expect(problems.map((p) => p.code)).toEqual(['column-outside-room']);
    expect(problems[0]).toMatchObject({ columnId: 'c5' });
  });

  it('problems come in a fixed order: above ceiling, column outside, no entrance', () => {
    const room: Room = {
      ...withWindow(2000, 1200),
      columns: [...l.columns, column('c2', 8800, 1000, 9200, 1400)],
      openings: withWindow(2000, 1200).openings.filter((o) => o.id !== 'entrance'),
    };
    const problems = validateRoom(room);
    expect(problems.map((p) => p.code)).toEqual(['opening-above-ceiling', 'column-outside-room', 'no-entrance']);
    expect(problems.every((p) => p.message.length > 0)).toBe(true);
  });
});

describe('normalizeOutline', () => {
  it('reverses a clockwise outline and drops repeated corners, keeping the first corner first', () => {
    const messy = [pt(0, 0), pt(0, 6000), pt(0, 6000), pt(6000, 6000), pt(6000, 0), pt(0, 0)];
    expect(normalizeOutline(messy)).toEqual([pt(0, 0), pt(6000, 0), pt(6000, 6000), pt(0, 6000)]);
  });

  it('leaves a sound outline untouched', () => {
    expect(normalizeOutline(good.outline)).toEqual(good.outline);
  });
});

describe('a bad room is reported, never laid out', () => {
  const bad: [string, Room][] = [
    ['clockwise', { ...good, outline: [...good.outline].reverse() }],
    ['bow-tie', { ...good, outline: [pt(0, 0), pt(6000, 6000), pt(6000, 0), pt(0, 6000)] }],
    ['entrance off the wall', { ...good, openings: [door('entrance', 0, 5500, 1000, true)] }],
    ['no entrance', { ...good, openings: [] }],
  ];
  it.each(bad)('%s: autoLayout returns the problem and no options', (_name, room) => {
    const result = layout(room);
    expect(result.options).toEqual([]);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems[0]!.message.length).toBeGreaterThan(15);
  });

  it.each(bad)('%s: validateLayout reports invalid-room and never "no violations"', (_name, room) => {
    const violations = validateLayout(makeDoc(room, testProducts, [place('g', testGondolaDouble, 3000, 4000)]));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.rule === 'invalid-room' && v.severity === 'error')).toBe(true);
  });

  it('a sound room has no problems and gets options', () => {
    const result = layout(good);
    expect(result.problems).toEqual([]);
    expect(result.options.length).toBeGreaterThan(0);
  });
});

describe('several entrances', () => {
  // A wall of gondolas splits the room; each half has its own entrance. Everything is reachable
  // from its own side, but a fixture must be reachable from EVERY entrance.
  const room: Room = { ...rectRoom(6000, 8000), openings: [door('entrance', 0, 2500, 1000, true), door('second', 2, 2500, 1000, true)] };
  it('keeps a clear zone inside each entrance', () => {
    const top = validateLayout(makeDoc(room, testProducts, [place('g', testGondolaDouble, 3000, 6200)]));
    expect(top.map((v) => [v.rule, v.openingId])).toContainEqual(['blocked-door', 'second']);
  });

  it('a fixture reachable from one entrance only is reported', () => {
    const barrier = [0, 1, 2, 3, 4].map((i) => place(`b${i}`, testGondolaDouble, 600 + i * 1200, 4000));
    const violations = validateLayout(makeDoc(room, testProducts, barrier));
    expect(violations.some((v) => v.rule === 'unreachable')).toBe(true);
  });
});

describe('ghost placements', () => {
  it('a placement whose product is missing is an error, not silently dropped', () => {
    const doc = makeDoc(good, [testWallShelf], [place('ghost', testGondolaDouble, 3000, 4000)]);
    const violations = validateLayout(doc);
    expect(violations.map((v) => [v.rule, v.placementIds])).toEqual([['unknown-product', ['ghost']]]);
  });

  it('a placement of a variant with unknown size is an error, not a crash', () => {
    const unsized = { ...testGondolaDouble, variants: [{ ...testGondolaDouble.variants[0]!, widthUm: null }] };
    const violations = validateLayout(makeDoc(good, [unsized], [place('x', unsized, 3000, 4000)]));
    expect(violations.map((v) => v.rule)).toEqual(['unknown-product']);
  });
});

describe('validateRoom: problems carry their numbers, so the app can translate them (M2-9)', () => {
  const l = lShapeWithColumn; // wall 5 is 7 000 000 um long, ceiling 3 000 000 um
  const window2 = (wallIndex: number, offsetMm: number): Opening => ({
    id: 'window-2', kind: 'window', wallIndex, offsetUm: mm(offsetMm), widthUm: mm(1000), heightUm: mm(1200), sillHeightUm: mm(900),
  });

  it('an opening on a wall that does not exist carries its 1-based wall number and the wall count', () => {
    const problems = validateRoom({ ...l, openings: [...l.openings, window2(6, 100)] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'opening-wall-missing', values: { wallNumber: 7, wallCount: 6 } });
  });

  it('an opening running past the end of its wall carries width, offset, wall length and the overhang', () => {
    const room: Room = { ...l, openings: l.openings.map((o) => (o.id === 'window-1' ? { ...o, offsetUm: 6_000_000 } : o)) };
    const problems = validateRoom(room);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      code: 'opening-off-wall',
      values: { widthUm: 2_000_000, offsetUm: 6_000_000, wallLengthUm: 7_000_000, overUm: 1_000_000 },
    });
  });

  it('an opening that starts before its wall has no overhang value', () => {
    const room: Room = { ...l, openings: l.openings.map((o) => (o.id === 'window-1' ? { ...o, offsetUm: -100_000 } : o)) };
    const problem = validateRoom(room)[0]!;
    expect(problem.code).toBe('opening-off-wall');
    expect(problem).toMatchObject({ values: { widthUm: 2_000_000, offsetUm: -100_000, wallLengthUm: 7_000_000 } });
    expect(problem).not.toHaveProperty('values.overUm');
  });

  it('two openings overlapping carry the shared length', () => {
    // entrance covers 4 000 000..5 000 000 on wall 0; the new window covers 4 200 000..5 200 000.
    const problems = validateRoom({ ...l, openings: [...l.openings, window2(0, 4200)] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'openings-overlap', values: { sharedUm: 800_000 } });
  });

  it('an opening above the ceiling carries its top and the ceiling height', () => {
    const room: Room = { ...l, openings: l.openings.map((o) => (o.id === 'window-1' ? { ...o, sillHeightUm: 2_000_000, heightUm: 1_200_000 } : o)) };
    const problems = validateRoom(room);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'opening-above-ceiling', values: { topUm: 3_200_000, ceilingUm: 3_000_000 } });
  });

  it('a problem with nothing to fill in has no values key', () => {
    const problems = validateRoom({ ...l, openings: l.openings.filter((o) => o.id !== 'entrance') });
    expect(problems.map((p) => p.code)).toEqual(['no-entrance']);
    expect(problems[0]).not.toHaveProperty('values');
  });
});
