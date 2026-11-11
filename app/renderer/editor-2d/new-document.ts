import { parseDesignDocument, SCHEMA_VERSION } from '../../../src/core/index';
import type { DesignDocument, Point } from '../../../src/core/index';

/** A new design document for a room just typed or drawn: no columns, openings or products yet. */
export function newDocument(outline: Point[], ceilingHeightUm: number, name: string): DesignDocument | null {
  const document: DesignDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    room: { outline, ceilingHeightUm, columns: [], openings: [] },
    products: [],
    placements: [],
  };
  return parseDesignDocument(document).ok ? document : null;
}
