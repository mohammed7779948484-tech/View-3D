/** Snapshots of the four fixture rooms, empty, and one hand-placed example. */
import { describe, it } from 'vitest';
import { rectCorners } from '../../src/geometry/index';
import { renderPlanSvg } from '../../src/render-svg/index';
import { defaultConfig, keepClearZones, placedFixtures, validateLayout } from '../../src/rules/index';
import { fixtureRooms, lShapeWithColumn } from '../fixtures/rooms';
import { testCounterLong, testGondolaDouble, testProducts, testShowcase, testTower, testWallShelf } from '../fixtures/products';
import { makeDoc, place } from '../rules/helpers';
import { expectSnapshot } from './snapshot';

describe('room snapshots', () => {
  for (const { name, description, room } of fixtureRooms) {
    it(`${name}: empty room with keep-clear zones`, () => {
      const doc = makeDoc(room, [], []);
      const svg = renderPlanSvg(doc, { title: `Room: ${name}`, subtitle: description, zones: keepClearZones(room, defaultConfig) });
      expectSnapshot(`rooms/${name}`, svg);
    });
  }

  it('lShapeWithColumn: hand-placed example with deliberate mistakes', () => {
    const doc = makeDoc(lShapeWithColumn, testProducts, [
      place('counter', testCounterLong, 7300, 1215, 270), // staff behind it, against the right wall
      place('showcase', testShowcase, 6850, 2900, 0),
      place('shelf-1', testWallShelf, 1500, 6800, 180),
      place('shelf-2', testWallShelf, 2700, 6800, 180),
      place('tower', testTower, 5700, 6700, 180),
      place('gondola-1', testGondolaDouble, 1900, 4600, 90),
      place('gondola-2', testGondolaDouble, 1900, 3400, 90),
      place('gondola-bad', testGondolaDouble, 3300, 3300, 0), // stands on the column
    ]);
    const violations = validateLayout(doc);
    const svg = renderPlanSvg(doc, {
      title: 'Hand-placed example (L-shaped room)',
      zones: keepClearZones(lShapeWithColumn, defaultConfig),
      accessZones: placedFixtures(doc, defaultConfig).flatMap((f) =>
        f.zones.map((z) => ({ placementId: f.placement.id, kind: z.kind, polygon: rectCorners(z.rect) })),
      ),
      violations: violations.map((v) => ({ placementIds: v.placementIds, message: v.message })),
    });
    expectSnapshot('rooms/lShapeWithColumn-hand-placed', svg);
  });
});
