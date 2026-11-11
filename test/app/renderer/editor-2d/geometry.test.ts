/// <reference lib="dom" />
// The module under test also holds pointer code that needs the DOM types; the root type check has none.
/** Typing a wall length: what the outline becomes, and when nothing can be done. */
import { describe, expect, it } from 'vitest';
import { withWallLength } from '../../../../app/renderer/editor-2d/geometry';

describe('withWallLength', () => {
  it('a normal wall: 4 m wall 0 set to 5 m moves corner 1 to (5 000 000, 0)', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 4_000_000, y: 0 },
      { x: 4_000_000, y: 3_000_000 },
      { x: 0, y: 3_000_000 },
    ];
    expect(withWallLength(rect, 0, 5_000_000)).toEqual([
      { x: 0, y: 0 },
      { x: 5_000_000, y: 0 },
      { x: 4_000_000, y: 3_000_000 },
      { x: 0, y: 3_000_000 },
    ]);
  });

  it('a zero-length wall cannot be lengthened: no change is possible, so null', () => {
    const outline = [
      { x: 1_000_000, y: 0 },
      { x: 5_000_000, y: 0 },
      { x: 5_000_000, y: 0 },
      { x: 5_000_000, y: 3_000_000 },
      { x: 1_000_000, y: 3_000_000 },
    ];
    expect(withWallLength(outline, 1, 500_000)).toBeNull();
  });
});
