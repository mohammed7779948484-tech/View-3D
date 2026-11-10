import { describe, expect, it } from 'vitest';
import { isPlaceable, isTall, seedProducts } from '../../src/catalog/index';
import { ProductSchema, RoomSchema, parseDesignDocument } from '../../src/core/index';
import type { Opening, Point, Room } from '../../src/core/index';
import { testProducts } from './products';
import {
  angledWall,
  fixtureRooms,
  lShapeWithColumn,
  protectedDoorway,
  smallRectOverfull,
} from './rooms';

const MM = 1000;

/** Bounding-box size of an outline in mm: [width, height]. */
function extentMm(outline: readonly Point[]): [number, number] {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  return [(Math.max(...xs) - Math.min(...xs)) / MM, (Math.max(...ys) - Math.min(...ys)) / MM];
}

/** Exact polygon area in mm^2 (shoelace with BigInt, so no precision loss). */
function areaMm2(outline: readonly Point[]): number {
  let twice = 0n;
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    twice += BigInt(p.x) * BigInt(q.y) - BigInt(q.x) * BigInt(p.y);
  });
  return Number(twice / 2n) / (MM * MM);
}

/** Length of wall `i` in um (fixture walls with openings are axis-aligned). */
function wallLengthUm(room: Room, wallIndex: number): number {
  const a = room.outline[wallIndex]!;
  const b = room.outline[(wallIndex + 1) % room.outline.length]!;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const entrances = (room: Room): Opening[] => room.openings.filter((o) => o.door?.isEntrance === true);

describe('fixture products', () => {
  it('all validate against the product schema', () => {
    for (const product of testProducts) {
      const result = ProductSchema.safeParse(product);
      expect(result.success, `${product.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('are all marked as synthetic: testOnly, test- ids, TEST names, no source', () => {
    expect(testProducts.length).toBeGreaterThanOrEqual(8);
    for (const product of testProducts) {
      expect(product.testOnly).toBe(true);
      expect(product.id.startsWith('test-')).toBe(true);
      expect(product.name.startsWith('TEST ')).toBe(true);
      expect(product.verification).toBe('verified');
      expect(product.source).toEqual({ url: null, dimensionsAsWritten: null });
    }
    expect(new Set(testProducts.map((p) => p.id)).size).toBe(testProducts.length);
  });

  it('never mix with the real seed', () => {
    for (const product of seedProducts) {
      expect(product.id.startsWith('test-')).toBe(false);
      expect(product.name.startsWith('TEST ')).toBe(false);
      expect(product.testOnly).toBe(false);
    }
    const seedIds = new Set(seedProducts.map((p) => p.id));
    for (const product of testProducts) {
      expect(seedIds.has(product.id)).toBe(false);
      expect(product.testOnly).toBe(true);
    }
  });

  it('contain the required sizes and placement kinds', () => {
    const summary = testProducts.map((p) => {
      const v = p.variants[0]!;
      return `${p.placement} ${v.widthUm! / MM}x${v.depthUm! / MM}x${v.heightUm! / MM}`;
    });
    for (const required of [
      'wall 1200x400x2100',
      'wall 1200x50x2400',
      'wall 600x600x1900',
      'island 1200x900x1400',
      'island 900x600x1350',
      'counter 1800x600x1000',
      'freestanding 1500x500x1000',
      'freestanding 800x800x900',
    ]) {
      expect(summary).toContain(required);
    }
  });

  it('are all placeable, and the tall ones are the ones above 1372 mm', () => {
    for (const product of testProducts) {
      for (const variant of product.variants) {
        expect(isPlaceable(product, variant.id)).toBe(true);
        expect(isTall(variant)).toBe(variant.heightUm! > 1372 * MM);
      }
    }
  });

  it('showcases have a 600 mm front clearance', () => {
    const showcases = testProducts.filter((p) => p.category === 'showcase');
    expect(showcases.length).toBeGreaterThan(0);
    for (const product of showcases) expect(product.clearances.frontUm).toBe(600 * MM);
  });
});

describe('fixture rooms', () => {
  it('there are four, each with a description', () => {
    expect(fixtureRooms.map((f) => f.name)).toEqual([
      'lShapeWithColumn',
      'angledWall',
      'smallRectOverfull',
      'protectedDoorway',
    ]);
    expect(fixtureRooms.map((f) => f.room)).toEqual([
      lShapeWithColumn,
      angledWall,
      smallRectOverfull,
      protectedDoorway,
    ]);
    for (const fixture of fixtureRooms) expect(fixture.description.length).toBeGreaterThan(20);
  });

  it.each(fixtureRooms)('$name passes the room schema', ({ room }) => {
    const result = RoomSchema.safeParse(room);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(room.ceilingHeightUm).toBe(3000 * MM);
  });

  it.each(fixtureRooms)('$name has exactly one entrance and every opening fits on its wall', ({ room }) => {
    expect(entrances(room)).toHaveLength(1);
    for (const opening of room.openings) {
      expect(opening.offsetUm).toBeGreaterThan(0);
      expect(opening.offsetUm + opening.widthUm).toBeLessThan(wallLengthUm(room, opening.wallIndex));
      expect(opening.sillHeightUm + opening.heightUm).toBeLessThanOrEqual(room.ceilingHeightUm);
    }
  });

  it.each(fixtureRooms)('$name works inside a full design document', ({ room }) => {
    const result = parseDesignDocument({
      schemaVersion: 1,
      id: 'fixture-doc',
      name: 'Fixture',
      room,
      products: testProducts,
      placements: [],
    });
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('lShapeWithColumn: 9 m x 7 m with a 3 m x 3 m notch, a 400 mm column, a door and a window', () => {
    const room = lShapeWithColumn;
    expect(extentMm(room.outline)).toEqual([9000, 7000]);
    expect(areaMm2(room.outline)).toBe(9000 * 7000 - 3000 * 3000);
    expect(room.outline).toHaveLength(6);
    expect(room.columns).toHaveLength(1);
    expect(extentMm(room.columns[0]!.outline)).toEqual([400, 400]);
    const entrance = entrances(room)[0]!;
    expect(entrance.widthUm).toBe(1000 * MM);
    expect(entrance.door?.swing).toBe('in');
    expect(room.outline[entrance.wallIndex]!.y).toBe(0); // bottom wall
    expect(room.outline[(entrance.wallIndex + 1) % 6]!.y).toBe(0);
    const windows = room.openings.filter((o) => o.kind === 'window');
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ widthUm: 2000 * MM, sillHeightUm: 900 * MM, heightUm: 1200 * MM });
    expect(windows[0]!.wallIndex).not.toBe(entrance.wallIndex);
  });

  it('angledWall: about 8 m x 6 m with one wall at a non-right angle', () => {
    const room = angledWall;
    expect(extentMm(room.outline)).toEqual([8000, 6000]);
    const n = room.outline.length;
    const slanted = room.outline.filter((p, i) => {
      const q = room.outline[(i + 1) % n]!;
      return p.x !== q.x && p.y !== q.y;
    });
    expect(slanted).toHaveLength(1);
    expect(slanted[0]).toEqual({ x: 8000 * MM, y: 2000 * MM });
    expect(entrances(room)[0]!.widthUm).toBe(1000 * MM);
    expect(room.openings.filter((o) => o.kind === 'window')).toHaveLength(1);
  });

  it('smallRectOverfull: 4 m x 5 m with a 900 mm entrance', () => {
    const room = smallRectOverfull;
    expect(extentMm(room.outline)).toEqual([4000, 5000]);
    expect(areaMm2(room.outline)).toBe(4000 * 5000);
    expect(entrances(room)[0]!.widthUm).toBe(900 * MM);
  });

  it('protectedDoorway: 7 m x 5 m with an entrance and a second interior door on the right wall', () => {
    const room = protectedDoorway;
    expect(extentMm(room.outline)).toEqual([7000, 5000]);
    const doors = room.openings.filter((o) => o.kind === 'door');
    expect(doors).toHaveLength(2);
    const entrance = entrances(room)[0]!;
    expect(entrance).toMatchObject({ widthUm: 1000 * MM, door: { isEntrance: true, swing: 'in' } });
    const interior = doors.find((d) => d.door?.isEntrance === false)!;
    expect(interior).toMatchObject({ widthUm: 900 * MM, door: { isEntrance: false, swing: 'in' } });
    expect(room.outline[interior.wallIndex]!.x).toBe(7000 * MM); // right wall
    expect(room.outline[(interior.wallIndex + 1) % 4]!.x).toBe(7000 * MM);
  });
});
