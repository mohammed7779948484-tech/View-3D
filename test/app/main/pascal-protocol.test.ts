/** Phase 1 of docs/decisions/0008: the view3d://app/ URL maps to a file inside the built renderer folder, and nothing else. */
import { isAbsolute, join, relative, resolve } from 'node:path';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PASCAL_PAGE_URL, pascalFilePath } from '../../../app/main/pascal-protocol';

const root = resolve('/tmp/out/renderer');

describe('pascalFilePath', () => {
  it('has the page url the window loads', () => {
    expect(PASCAL_PAGE_URL).toBe('view3d://app/pascal/index.html');
  });

  it('maps the page url to its file', () => {
    expect(pascalFilePath(PASCAL_PAGE_URL, root)).toBe(join(root, 'pascal', 'index.html'));
  });

  it('ignores the query and the hash', () => {
    expect(pascalFilePath('view3d://app/icons/select.webp?x=1#y', root)).toBe(join(root, 'icons', 'select.webp'));
  });

  it('decodes percent-encoding', () => {
    expect(pascalFilePath('view3d://app/material/a%20b.ktx2', root)).toBe(join(root, 'material', 'a b.ktx2'));
  });

  it.each([
    'file:///x',
    'https://app/x',
    'view3d://other/x',
    'view3d://app/',
    'view3d://app',
    'view3d://app/../main/index.js',
    'view3d://app/%2e%2e/main/index.js',
    'view3d://app/icons/..%5c..%5cmain%5cindex.js',
    'view3d://app/%2e%2e%2f%2e%2e%2fsecret',
  ])('refuses %s', (url) => {
    expect(pascalFilePath(url, root)).toBeNull();
  });

  it('property: a path of safe segments stays inside the root', () => {
    const segment = fc.stringMatching(/^[a-z0-9-]{1,8}$/);
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 5 }), (segments) => {
        const result = pascalFilePath(`view3d://app/${segments.join('/')}`, root);
        expect(result).not.toBeNull();
        const rel = relative(root, result!);
        expect(rel.startsWith('..')).toBe(false);
        expect(isAbsolute(rel)).toBe(false);
        expect(rel).toBe(join(...segments));
      }),
    );
  });
});
