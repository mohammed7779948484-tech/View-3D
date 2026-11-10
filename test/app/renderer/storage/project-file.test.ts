/** Issue M2-10: reading and writing the design document as project-file text. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDocument, serializeDocument } from '../../../../app/renderer/storage/project-file';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/m1-document.json');
const text = readFileSync(FIXTURE, 'utf8');
const json = (): Record<string, any> => JSON.parse(text) as Record<string, any>;

describe('readDocument', () => {
  it('reads the Milestone 1 document and writes it back byte for byte', () => {
    const result = readDocument(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.name).toBe('Corner shop');
    expect(serializeDocument(result.document)).toBe(text);
  });

  it('ignores a leading byte order mark', () => {
    const result = readDocument('﻿' + text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(serializeDocument(result.document)).toBe(text);
  });

  it('reports the line of a syntax error', () => {
    const result = readDocument('{\n  "schemaVersion": 1,\n  "id": }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not-json');
    expect(result.message).toContain('line 3');
  });

  it('reports line 1 for text that is not JSON at all', () => {
    const result = readDocument('not json at all');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not-json');
    expect(result.message).toContain('line 1');
  });

  it('rejects a newer schema version and says so', () => {
    const result = readDocument(JSON.stringify({ ...json(), schemaVersion: 2 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not-a-project');
    expect(result.details.some((d: string) => d.includes('unsupported schemaVersion'))).toBe(true);
  });

  it('rejects a document the schema refuses, with details', () => {
    const doc = json();
    doc['room'].ceilingHeightUm = 0;
    const result = readDocument(JSON.stringify(doc));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not-a-project');
    expect(result.details.length).toBeGreaterThan(0);
  });
});

describe('serializeDocument', () => {
  it('ends with exactly one LF and has no CR', () => {
    const result = readDocument(text);
    if (!result.ok) throw new Error(result.message);
    const out = serializeDocument(result.document);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
    expect(out).not.toContain('\r');
  });
});
