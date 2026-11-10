/** A design document as file text, and back. Pure: the disk is reached only through the preload bridge. */
import { parseDesignDocument } from '../../../src/core/index';
import type { DesignDocument } from '../../../src/core/index';

export type ReadResult = { ok: true; document: DesignDocument } | { ok: false; code: 'not-json' | 'not-a-project'; message: string; details: string[]; line?: number };

/** Two-space JSON with LF and one final newline: the same bytes on every machine. */
export function serializeDocument(document: DesignDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** True when `text` parses or is a valid beginning of JSON (it only ends too early). */
function validSoFar(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch (error) {
    const message = (error as Error).message;
    const position = /position (\d+)/.exec(message);
    if (position) return Number(position[1]) >= text.length;
    return message.startsWith('Unexpected end');
  }
}

/** 1-based line of the first syntax error. V8 does not always say, so find the shortest bad prefix. */
function errorLine(text: string): number {
  if (validSoFar(text)) return text.split('\n').length;
  let good = 0;
  let bad = text.length;
  while (bad - good > 1) {
    const middle = Math.floor((good + bad) / 2);
    if (validSoFar(text.slice(0, middle))) good = middle;
    else bad = middle;
  }
  return text.slice(0, bad - 1).split('\n').length;
}

/** Reads file text. The document keeps the file's key order, so saving it unchanged gives the same bytes. */
export function readDocument(text: string): ReadResult {
  const clean = text.startsWith('﻿') ? text.slice(1) : text;
  let json: unknown;
  try {
    json = JSON.parse(clean);
  } catch {
    const line = errorLine(clean);
    return { ok: false, code: 'not-json', message: `This file is not a View-3D project: it is not valid JSON (line ${line}).`, details: [], line };
  }
  const parsed = parseDesignDocument(json);
  if (!parsed.ok) return { ok: false, code: 'not-a-project', message: 'This file is not a valid View-3D project.', details: parsed.errors };
  return { ok: true, document: json as DesignDocument };
}
