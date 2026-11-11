/**
 * Hand-built layouts, each with one violation whose words, code and numbers are written out by
 * hand from the rule texts and the fixture sizes (never produced by `validateLayout`). Shared by
 * the engine test, the translation test and the live-validation e2e test. Synthetic products only.
 */
import type { DesignDocument, Placement, Room } from '../../src/core/index';
import type { RuleId } from '../../src/rules/index';
import { lShapeWithColumn, protectedDoorway } from './rooms';
import {
  testBin,
  testCounterLong,
  testGondolaDouble,
  testProducts,
  testShowcase,
  testWallShelf,
} from './products';
import { makeDoc, mm, place, pt, rectRoom } from '../rules/helpers';

export type ViolationCase = {
  name: string;
  doc: DesignDocument;
  /** The violation under test: this rule, whose first placement id is `first` (and this opening). */
  rule: RuleId;
  first: string;
  openingId?: string;
  expected: {
    placementIds: string[];
    detail: string | undefined;
    values: Record<string, number> | undefined;
    openingId?: string;
    columnId?: string;
    /** Today's English message, word for word. */
    message: string;
  };
};

const DEG = 1_000_000;
const doc = (room: Room, placements: Placement[]): DesignDocument => makeDoc(room, testProducts, placements);

const GONDOLA = '"TEST double-sided gondola"';
const SHELF = '"TEST wall shelving unit"';
const SHOWCASE = '"TEST glass showcase"';
const COUNTER = '"TEST long counter"';
const BIN = '"TEST freestanding bin"';

/** The 8 m room of the unreachable cases: a barrier of gondolas across a 9 m deep room. */
const roomOfWidth = (widthMm: number): Room => ({
  outline: [pt(0, 0), pt(widthMm, 0), pt(widthMm, 9000), pt(0, 9000)],
  ceilingHeightUm: mm(3000),
  columns: [],
  openings: [
    {
      id: 'entrance', kind: 'door', wallIndex: 0, offsetUm: mm(1000), widthUm: mm(1000), heightUm: mm(2100), sillHeightUm: 0,
      door: { isEntrance: true, swing: 'in', hinge: 'start' },
    },
  ],
});
const barrier = [
  place('g1', testGondolaDouble, 600, 4000),
  place('g2', testGondolaDouble, 1800, 4000),
  place('shelf', testWallShelf, 1500, 8800, 180),
];

/** The wall shelf on the left wall, in front of window-1 (y 2500..4500, sill 900 mm). */
export const windowBlockedDoc: DesignDocument = makeDoc(lShapeWithColumn, [testWallShelf], [
  { id: 'p1', productId: testWallShelf.id, variantId: 'default', center: { x: 200_000, y: 3_500_000 }, rotationUdeg: 270 * DEG },
]);
export const windowBlockedMessage = `${SHELF} (p1) is 2100 mm high and stands in front of window "window-1", whose sill is at 900 mm.`;

/**
 * Enclosed staff space: the counter's back zone (x 2100..3900, y 5100..6015) is walled in by two
 * showcases from the counter to the top wall, so staff cannot get behind it.
 */
const staffEnclosed: Placement[] = [
  place('counter', testCounterLong, 3000, 4800, 180),
  place('left', testShowcase, 1850, 5350, 90),
  place('right', testShowcase, 4150, 5350, 270),
];
const mainAisleLayout: Placement[] = [
  place('counter', testCounterLong, 3000, 4800, 180),
  place('left', testShowcase, 3000 - 500 - 750, 3000),
  place('right', testShowcase, 3000 + 500 + 750, 3000),
];

export const violationCases: readonly ViolationCase[] = [
  {
    name: 'window-blocked',
    doc: windowBlockedDoc,
    rule: 'window-blocked',
    first: 'p1',
    expected: {
      placementIds: ['p1'], detail: undefined, values: { heightUm: 2_100_000, sillUm: 900_000 },
      openingId: 'window-1', message: windowBlockedMessage,
    },
  },
  {
    name: 'blocked-door, entrance, swing',
    doc: doc(protectedDoorway, [place('in-swing', testShowcase, 3500, 600)]),
    rule: 'blocked-door',
    first: 'in-swing',
    expected: {
      placementIds: ['in-swing'], detail: 'door-swing', values: undefined, openingId: 'entrance',
      message: `${SHOWCASE} (in-swing) blocks the entrance. The leaf of the entrance sweeps this area when it opens.`,
    },
  },
  {
    name: 'blocked-door, entrance, clear floor just inside',
    // x 4100..4900, y 600..1400: inside the approach (x 3000..4455, y < 1525), outside the swing and the decompression zone (x < 4000).
    doc: doc(protectedDoorway, [place('bin', testBin, 4500, 1000)]),
    rule: 'blocked-door',
    first: 'bin',
    openingId: 'entrance',
    expected: {
      placementIds: ['bin'], detail: 'entrance-clear', values: undefined, openingId: 'entrance',
      message: `${BIN} (bin) blocks the entrance. Customers need clear floor just inside the entrance.`,
    },
  },
  {
    name: 'blocked-door, entrance, decompression zone',
    // y 1550..2050: past the approach (1525), inside the decompression zone (to 1666.667).
    doc: doc(protectedDoorway, [place('s', testShowcase, 3500, 1800)]),
    rule: 'blocked-door',
    first: 's',
    expected: {
      placementIds: ['s'], detail: 'decompression', values: undefined, openingId: 'entrance',
      message: `${SHOWCASE} (s) blocks the entrance. Customers arriving need open floor and a clear view straight in from the entrance.`,
    },
  },
  {
    name: 'blocked-door, inner door, approach',
    // x 5900..6700, y 4100..4900: in the approach of back-room-door (x 5475..7000, y 3000..4355), above its swing (y 3000..3900).
    doc: doc(protectedDoorway, [place('bin', testBin, 6300, 4500)]),
    rule: 'blocked-door',
    first: 'bin',
    expected: {
      placementIds: ['bin'], detail: 'door-approach', values: undefined, openingId: 'back-room-door',
      message: `${BIN} (bin) blocks door "back-room-door". People need clear floor in front of door "back-room-door" to open it and walk through.`,
    },
  },
  {
    name: 'access-blocked, customer, front, wall',
    // Showcase y 5450..5950; its front zone y 5950..6865 runs through the top wall.
    doc: doc(rectRoom(6000, 6000), [place('s', testShowcase, 3000, 5700)]),
    rule: 'access-blocked',
    first: 's',
    expected: {
      placementIds: ['s'], detail: 'customer-front-wall', values: { requiredUm: 915_000 },
      message: `The aisle in front of ${SHOWCASE} (s) needs 915 mm clear, but a wall is in the way.`,
    },
  },
  {
    name: 'access-blocked, customer, front, column',
    // Showcase x 2450..3950, y 2150..2650; its front zone y 2650..3565 holds the column (x 3000..3400, y 3000..3400).
    doc: doc(lShapeWithColumn, [place('s', testShowcase, 3200, 2400)]),
    rule: 'access-blocked',
    first: 's',
    expected: {
      placementIds: ['s'], detail: 'customer-front-column', values: { requiredUm: 915_000 },
      message: `The aisle in front of ${SHOWCASE} (s) needs 915 mm clear, but column "column-1" is in the way.`,
    },
  },
  {
    name: 'access-blocked, customer, front, fixture',
    // a: y 2750..3250, front zone y 3250..4165; b: y 3450..3950 stands in it.
    doc: doc(rectRoom(6000, 6000), [place('a', testShowcase, 3000, 3000), place('b', testShowcase, 3000, 3700)]),
    rule: 'access-blocked',
    first: 'a',
    expected: {
      placementIds: ['a', 'b'], detail: 'customer-front-fixture', values: { requiredUm: 915_000 },
      message: `The aisle in front of ${SHOWCASE} (a) needs 915 mm clear, but ${SHOWCASE} (b) is in the way.`,
    },
  },
  {
    name: 'access-blocked, customer, back, wall',
    // Gondola y 0..900 flush on the bottom wall; its back zone y -915..0 is outside the room.
    doc: doc(rectRoom(6000, 6000), [place('g', testGondolaDouble, 5000, 450)]),
    rule: 'access-blocked',
    first: 'g',
    expected: {
      placementIds: ['g'], detail: 'customer-back-wall', values: { requiredUm: 915_000 },
      message: `The aisle behind ${GONDOLA} (g) needs 915 mm clear, but a wall is in the way.`,
    },
  },
  {
    name: 'access-blocked, customer, back, column',
    // Gondola x 2400..3600, y 3700..4600 on the L room; its back zone y 2785..3700 holds the column (y 3000..3400).
    doc: doc(lShapeWithColumn, [place('g', testGondolaDouble, 3000, 4150)]),
    rule: 'access-blocked',
    first: 'g',
    expected: {
      placementIds: ['g'], detail: 'customer-back-column', values: { requiredUm: 915_000 },
      message: `The aisle behind ${GONDOLA} (g) needs 915 mm clear, but column "column-1" is in the way.`,
    },
  },
  {
    name: 'access-blocked, customer, back, fixture',
    // Gondola y 3550..4450 faces +y; its back zone y 2635..3550 holds the showcase y 2800..3300.
    doc: doc(rectRoom(8000, 8000), [place('g', testGondolaDouble, 4000, 4000), place('s', testShowcase, 4000, 3050)]),
    rule: 'access-blocked',
    first: 'g',
    expected: {
      placementIds: ['g', 's'], detail: 'customer-back-fixture', values: { requiredUm: 915_000 },
      message: `The aisle behind ${GONDOLA} (g) needs 915 mm clear, but ${SHOWCASE} (s) is in the way.`,
    },
  },
  {
    name: 'access-blocked, staff, back, wall',
    // Counter y 100..700 facing +y; its staff space y -815..100 is outside the room.
    doc: doc(rectRoom(6000, 6000), [place('c', testCounterLong, 1500, 400)]),
    rule: 'access-blocked',
    first: 'c',
    expected: {
      placementIds: ['c'], detail: 'staff-back-wall', values: { requiredUm: 915_000 },
      message: `The staff space behind ${COUNTER} (c) needs 915 mm clear, but a wall is in the way.`,
    },
  },
  {
    name: 'access-blocked, staff, back, column',
    // Counter x 2100..3900, y 3400..4000 facing +y... its staff space y 2485..3400 holds the column (x 3000..3400, y 3000..3400).
    doc: doc(lShapeWithColumn, [place('c', testCounterLong, 3000, 3700)]),
    rule: 'access-blocked',
    first: 'c',
    expected: {
      placementIds: ['c'], detail: 'staff-back-column', values: { requiredUm: 915_000 },
      message: `The staff space behind ${COUNTER} (c) needs 915 mm clear, but column "column-1" is in the way.`,
    },
  },
  {
    name: 'access-blocked, staff, back, fixture',
    // Counter y 2700..3300 facing +y; its staff space y 1785..2700 holds the showcase y 1950..2450.
    doc: doc(rectRoom(6000, 6000), [place('c', testCounterLong, 1500, 3000), place('s', testShowcase, 1500, 2200)]),
    rule: 'access-blocked',
    first: 'c',
    expected: {
      placementIds: ['c', 's'], detail: 'staff-back-fixture', values: { requiredUm: 915_000 },
      message: `The staff space behind ${COUNTER} (c) needs 915 mm clear, but ${SHOWCASE} (s) is in the way.`,
    },
  },
  {
    name: 'unreachable, customers',
    // Three gondolas close the 3600 mm wide room at y 4000; the shelf behind them cannot be reached.
    doc: doc(roomOfWidth(3600), [...barrier, place('g3', testGondolaDouble, 3000, 4000)]),
    rule: 'unreachable',
    first: 'shelf',
    expected: {
      placementIds: ['shelf'], detail: 'customer', values: { requiredUm: 915_000 },
      message: `Customers cannot walk from the entrance to ${SHELF} (shelf).`,
    },
  },
  {
    name: 'unreachable, staff',
    doc: doc(rectRoom(6000, 6100), staffEnclosed),
    rule: 'unreachable',
    first: 'counter',
    expected: {
      placementIds: ['counter'], detail: 'staff', values: { requiredUm: 600_000 },
      message: `Staff cannot get behind ${COUNTER} (counter): the way in is narrower than 600 mm.`,
    },
  },
  {
    name: 'aisle-too-narrow',
    doc: doc(roomOfWidth(3100), barrier),
    rule: 'aisle-too-narrow',
    first: 'shelf',
    expected: {
      placementIds: ['shelf'], detail: undefined, values: { requiredUm: 915_000 },
      message: `The way from the entrance to ${SHELF} (shelf) is narrower than 915 mm somewhere.`,
    },
  },
  {
    name: 'main-aisle',
    // 1000 mm between the showcases right in front of the counter.
    doc: doc(rectRoom(6000, 6100), mainAisleLayout),
    rule: 'main-aisle',
    first: 'counter',
    expected: {
      placementIds: ['counter'], detail: undefined, values: { requiredUm: 1_200_000 },
      message: `The main aisle from the entrance to ${COUNTER} (counter) is narrower than 1200 mm somewhere.`,
    },
  },
  {
    name: 'overlap',
    doc: doc(rectRoom(8000, 8000), [place('a', testGondolaDouble, 3000, 5000), place('b', testGondolaDouble, 3500, 5200)]),
    rule: 'overlap',
    first: 'a',
    expected: {
      placementIds: ['a', 'b'], detail: undefined, values: undefined,
      message: `${GONDOLA} (a) and ${GONDOLA} (b) overlap.`,
    },
  },
  {
    name: 'outside-room',
    // x 5400..6600, y 4550..5450: the right half is in the notch.
    doc: doc(lShapeWithColumn, [place('g', testGondolaDouble, 6000, 5000)]),
    rule: 'outside-room',
    first: 'g',
    expected: {
      placementIds: ['g'], detail: undefined, values: undefined,
      message: `${GONDOLA} (g) is not fully inside the room.`,
    },
  },
  {
    name: 'column',
    doc: doc(lShapeWithColumn, [place('g', testGondolaDouble, 3200, 3200)]),
    rule: 'column',
    first: 'g',
    expected: {
      placementIds: ['g'], detail: undefined, values: undefined, columnId: 'column-1',
      message: `${GONDOLA} (g) stands on column "column-1".`,
    },
  },
  {
    name: 'wall-unit-not-on-wall',
    doc: doc(rectRoom(6000, 6000), [place('open', testWallShelf, 3000, 4000)]),
    rule: 'wall-unit-not-on-wall',
    first: 'open',
    expected: {
      placementIds: ['open'], detail: undefined, values: undefined,
      message: `${SHELF} (open) is single-sided: its back must stand against a wall (clear of doors) or against the back of another single-sided unit.`,
    },
  },
  {
    name: 'unknown-product',
    doc: doc(rectRoom(6000, 6000), [{ id: 'ghost', productId: 'nope', variantId: 'default', center: pt(3000, 3000), rotationUdeg: 0 }]),
    rule: 'unknown-product',
    first: 'ghost',
    expected: {
      placementIds: ['ghost'], detail: undefined, values: undefined,
      message: 'Placement "ghost" refers to product "nope" / "default", which is not in the document.',
    },
  },
];
