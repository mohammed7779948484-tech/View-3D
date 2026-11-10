/** The snapshot comparison must not depend on how git checked the files out (LF or CRLF). */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectSnapshot } from './snapshot';

describe('snapshot comparison', () => {
  const svg = '<svg>\n<rect/>\n</svg>\n';
  const rootWith = (content: string): string => {
    const root = mkdtempSync(join(tmpdir(), 'view3d-snap-'));
    mkdirSync(join(root, 'a'), { recursive: true });
    writeFileSync(join(root, 'a', 'b.svg'), content);
    return root;
  };

  it('matches a file checked out with Windows line endings (core.autocrlf=true)', () => {
    expect(() => expectSnapshot('a/b', svg, rootWith(svg.replace(/\n/g, '\r\n')))).not.toThrow();
  });

  it('still fails when the content really differs', () => {
    expect(() => expectSnapshot('a/b', svg, rootWith(svg.replace('rect', 'circle')))).toThrow();
  });

  it('fails with instructions when the snapshot is missing', () => {
    expect(() => expectSnapshot('a/missing', svg, rootWith(svg))).toThrow(/snapshots:update/);
  });
});
