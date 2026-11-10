/**
 * The open design document and its undo history: the only mutable copy in the app
 * (docs/ARCHITECTURE.md section 9). Every edit is an immer recipe; the result must pass the schema
 * or it is refused and nothing changes. Undo is a stack of whole documents (owner ruling
 * 2026-11-11); immer shares the unchanged parts, so a snapshot costs only what changed.
 */
import { produce } from 'immer';
import { parseDesignDocument } from '../../../src/core/index';
import type { DesignDocument } from '../../../src/core/index';

export type EditResult = { ok: true } | { ok: false; errors: string[] };
export type DocumentState = { document: DesignDocument | null; canUndo: boolean; canRedo: boolean };
export type DocumentStore = {
  getState(): DocumentState;
  subscribe(listener: () => void): () => void;
  /** Open or start a project: replaces the document and clears undo and redo. */
  load(document: DesignDocument | null): void;
  /** Applies an immer recipe (mutate the draft or return a replacement). */
  edit(recipe: (draft: DesignDocument) => void | DesignDocument): EditResult;
  /** False, and nothing changes, when there is nothing to undo. */
  undo(): boolean;
  redo(): boolean;
};

export function createDocumentStore(initial: DesignDocument | null): DocumentStore {
  let document = initial;
  let past: DesignDocument[] = [];
  let future: DesignDocument[] = [];
  let state: DocumentState = snapshot();
  const listeners = new Set<() => void>();

  function snapshot(): DocumentState {
    return { document, canUndo: past.length > 0, canRedo: future.length > 0 };
  }
  function changed(): void {
    state = snapshot();
    for (const listener of [...listeners]) listener();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load(next) {
      document = next;
      past = [];
      future = [];
      changed();
    },
    edit(recipe) {
      if (document === null) throw new Error('edit: no document is open');
      const next = produce(document, recipe);
      if (next === document) return { ok: true };
      const parsed = parseDesignDocument(next);
      if (!parsed.ok) return { ok: false, errors: parsed.errors };
      past.push(document);
      future = [];
      document = next;
      changed();
      return { ok: true };
    },
    undo() {
      const previous = past.pop();
      if (previous === undefined || document === null) return false;
      future.push(document);
      document = previous;
      changed();
      return true;
    },
    redo() {
      const next = future.pop();
      if (next === undefined || document === null) return false;
      past.push(document);
      document = next;
      changed();
      return true;
    },
  };
}
