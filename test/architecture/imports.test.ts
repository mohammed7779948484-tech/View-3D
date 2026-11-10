/**
 * Enforces the dependency direction written in docs/ARCHITECTURE.md by reading the import
 * statements under src/. If this fails, either move the code or change the architecture document
 * and this table together, on purpose.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../../src');

/** module -> the other src modules it may import. */
const ALLOWED: Record<string, string[]> = {
  core: [],
  geometry: [],
  catalog: ['core'],
  rules: ['core', 'geometry'],
  layout: ['core', 'geometry', 'rules'],
  'render-svg': ['core', 'geometry'],
};

/** npm packages that only one file may import, so they can be swapped in one place. */
const SINGLE_IMPORTER: Record<string, string> = {
  'clipper2-ts': 'geometry/clip.ts',
  '@resvg/resvg-js': 'render-svg/png.ts',
};

/** Modules that must run in a browser, a worker and Node alike: no Node or DOM APIs. */
const PORTABLE = ['core', 'geometry', 'catalog', 'rules', 'layout'];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}
const imports = (file: string): string[] =>
  // `import x from '...'`, `export ... from '...'`, bare `import '...'` and dynamic `import('...')`.
  [...readFileSync(file, 'utf8').matchAll(/(?:(?:import|export)\s[^;'"]*?from\s+|import\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]!);
const posix = (p: string): string => p.split(sep).join('/');

describe('architecture', () => {
  const all = files(SRC);

  it('every folder under src is a known module', () => {
    const modules = readdirSync(SRC, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(modules).toEqual(Object.keys(ALLOWED).sort());
  });

  it('modules import only what the architecture allows', () => {
    const violations: string[] = [];
    for (const file of all) {
      const from = posix(relative(SRC, file)).split('/')[0]!;
      for (const spec of imports(file)) {
        if (!spec.startsWith('.')) continue;
        const target = posix(relative(SRC, resolve(file, '..', spec)));
        if (target.startsWith('..')) {
          violations.push(`${posix(relative(SRC, file))} imports outside src: ${spec}`);
          continue;
        }
        const to = target.split('/')[0]!;
        if (to !== from && !ALLOWED[from]!.includes(to)) violations.push(`${posix(relative(SRC, file))} -> ${to} (not allowed for ${from})`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('wrapped npm packages have a single importer', () => {
    for (const [pkg, only] of Object.entries(SINGLE_IMPORTER)) {
      const importers = all.filter((f) => imports(f).includes(pkg)).map((f) => posix(relative(SRC, f)));
      expect(importers, pkg).toEqual([only]);
    }
  });

  it('engine modules stay portable: no Node built-ins, no DOM globals', () => {
    const offenders: string[] = [];
    for (const file of all) {
      const rel = posix(relative(SRC, file));
      if (!PORTABLE.includes(rel.split('/')[0]!)) continue;
      const text = readFileSync(file, 'utf8');
      if (imports(file).some((s) => s.startsWith('node:'))) offenders.push(`${rel}: node import`);
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      // `document` is also an ordinary variable name here (the design document), so only real DOM calls count.
      if (/(?<![.\w])(window|navigator|localStorage)\s*\./.test(code) || /(?<![.\w])document\s*\.\s*(createElement|querySelector|getElementById|body|head)\b/.test(code)) {
        offenders.push(`${rel}: DOM global`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
