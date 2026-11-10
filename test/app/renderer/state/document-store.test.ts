import { describe, expect, it, vi } from 'vitest';
import { parseDesignDocument } from '../../../../src/core/index';
import type { DesignDocument } from '../../../../src/core/index';
import { lShapeWithColumn } from '../../../fixtures/rooms';
import { createDocumentStore } from '../../../../app/renderer/state/document-store';

function makeDoc(id = 'test-doc', name = 'Test shop'): DesignDocument {
  return structuredClone({
    schemaVersion: 1,
    id,
    name,
    room: lShapeWithColumn,
    products: [],
    placements: [],
  }) as DesignDocument;
}

const bytes = (d: DesignDocument | null) => JSON.stringify(d);

describe('fixture', () => {
  it('is a valid design document', () => {
    expect(parseDesignDocument(makeDoc()).ok).toBe(true);
  });
});

describe('document store', () => {
  it('starts empty with no history', () => {
    const s = createDocumentStore(null);
    expect(s.getState()).toEqual({ document: null, canUndo: false, canRedo: false });
  });

  it('throws when editing with no document open', () => {
    const s = createDocumentStore(null);
    expect(() =>
      s.edit((d) => {
        d.name = 'x';
      }),
    ).toThrow(Error);
  });

  it('applies a valid edit and stays schema-valid', () => {
    const s = createDocumentStore(makeDoc());
    expect(
      s.edit((d) => {
        d.name = 'Renamed';
      }),
    ).toEqual({ ok: true });
    expect(s.getState().document?.name).toBe('Renamed');
    expect(s.getState().canUndo).toBe(true);
    expect(parseDesignDocument(s.getState().document).ok).toBe(true);
    expect(
      s.edit((d) => {
        d.room.ceilingHeightUm = 3_200_000;
      }),
    ).toEqual({ ok: true });
    expect(s.getState().document?.room.ceilingHeightUm).toBe(3_200_000);
  });

  it.each([0, 3_000_000.5])('refuses ceilingHeightUm = %s without changing anything', (value) => {
    const s = createDocumentStore(makeDoc());
    const listener = vi.fn();
    s.subscribe(listener);
    const before = bytes(s.getState().document);
    const result = s.edit((d) => {
      d.room.ceilingHeightUm = value;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    expect(bytes(s.getState().document)).toBe(before);
    expect(s.getState().canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('undo restores the exact previous bytes and redo reapplies', () => {
    const s = createDocumentStore(makeDoc());
    const before = bytes(s.getState().document);
    s.edit((d) => {
      d.name = 'Renamed';
    });
    const after = bytes(s.getState().document);
    expect(after).not.toBe(before);
    expect(s.undo()).toBe(true);
    expect(bytes(s.getState().document)).toBe(before);
    expect(s.getState().canRedo).toBe(true);
    expect(s.getState().canUndo).toBe(false);
    expect(s.redo()).toBe(true);
    expect(bytes(s.getState().document)).toBe(after);
  });

  it('survives 100 edits, 100 undos and 100 redos exactly', () => {
    const s = createDocumentStore(makeDoc());
    const start = bytes(s.getState().document);
    for (let i = 0; i < 100; i++) {
      const r = s.edit((d) => {
        d.room.ceilingHeightUm = 3_001_000 + i * 1000;
      });
      expect(r.ok).toBe(true);
    }
    const end = bytes(s.getState().document);
    expect(s.getState().document?.room.ceilingHeightUm).toBe(3_100_000);
    for (let i = 0; i < 100; i++) expect(s.undo()).toBe(true);
    expect(bytes(s.getState().document)).toBe(start);
    expect(s.undo()).toBe(false);
    expect(bytes(s.getState().document)).toBe(start);
    expect(s.getState().canUndo).toBe(false);
    for (let i = 0; i < 100; i++) expect(s.redo()).toBe(true);
    expect(bytes(s.getState().document)).toBe(end);
    expect(s.redo()).toBe(false);
    expect(bytes(s.getState().document)).toBe(end);
  });

  it('clears redo on a new edit after an undo', () => {
    const s = createDocumentStore(makeDoc());
    s.edit((d) => {
      d.name = 'one';
    });
    s.undo();
    expect(s.getState().canRedo).toBe(true);
    s.edit((d) => {
      d.name = 'two';
    });
    expect(s.getState().canRedo).toBe(false);
    expect(s.redo()).toBe(false);
    expect(s.getState().document?.name).toBe('two');
  });

  it('adds no history entry for a recipe that changes nothing', () => {
    const s = createDocumentStore(makeDoc());
    const listener = vi.fn();
    s.subscribe(listener);
    expect(s.edit(() => {})).toEqual({ ok: true });
    expect(s.getState().canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('accepts a recipe that returns a replacement and can undo it', () => {
    const s = createDocumentStore(makeDoc());
    const before = bytes(s.getState().document);
    const replacement = makeDoc('other-doc', 'Replacement');
    expect(s.edit(() => replacement)).toEqual({ ok: true });
    expect(s.getState().document?.id).toBe('other-doc');
    expect(s.getState().document?.name).toBe('Replacement');
    expect(s.undo()).toBe(true);
    expect(bytes(s.getState().document)).toBe(before);
  });

  it('load replaces the document and clears history', () => {
    const s = createDocumentStore(makeDoc());
    s.edit((d) => {
      d.name = 'a';
    });
    s.edit((d) => {
      d.name = 'b';
    });
    s.undo();
    const other = makeDoc('second', 'Second');
    s.load(other);
    expect(s.getState().canUndo).toBe(false);
    expect(s.getState().canRedo).toBe(false);
    expect(bytes(s.getState().document)).toBe(bytes(other));
    s.load(null);
    expect(s.getState()).toEqual({ document: null, canUndo: false, canRedo: false });
  });

  it('is deterministic: same operations give identical bytes', () => {
    const run = () => {
      const s = createDocumentStore(makeDoc());
      for (let i = 0; i < 10; i++) {
        s.edit((d) => {
          d.name = 'step ' + i;
        });
      }
      s.undo();
      s.undo();
      s.redo();
      s.edit((d) => {
        d.room.ceilingHeightUm = 2_900_000;
      });
      s.undo();
      return bytes(s.getState().document);
    };
    expect(run()).toBe(run());
  });

  it('shares untouched subtrees and freezes the document', () => {
    const s = createDocumentStore(makeDoc());
    const roomBefore = s.getState().document?.room;
    s.edit((d) => {
      d.name = 'Renamed';
    });
    const doc = s.getState().document;
    expect(doc?.room).toBe(roomBefore);
    expect(Object.isFrozen(doc)).toBe(true);
  });

  it('notifies subscribers once per successful change only', () => {
    const s = createDocumentStore(makeDoc());
    const listener = vi.fn();
    const unsubscribe = s.subscribe(listener);
    s.edit((d) => {
      d.name = 'a';
    });
    expect(listener).toHaveBeenCalledTimes(1);
    s.undo();
    expect(listener).toHaveBeenCalledTimes(2);
    s.redo();
    expect(listener).toHaveBeenCalledTimes(3);
    s.load(makeDoc('x', 'X'));
    expect(listener).toHaveBeenCalledTimes(4);
    // not notified: refused edit, no-op, undo/redo returning false
    s.edit((d) => {
      d.room.ceilingHeightUm = 0;
    });
    s.edit(() => {});
    s.undo();
    s.redo();
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    s.edit((d) => {
      d.name = 'b';
    });
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
