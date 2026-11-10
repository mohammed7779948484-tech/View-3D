/**
 * Enforces the dependency direction written in docs/ARCHITECTURE.md by reading the import
 * statements under src/. If this fails, either move the code or change the architecture document
 * and this table together, on purpose.
 */
import { builtinModules } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  capture: ['core', 'geometry', 'rules'],
};

/** npm packages that only one file may import, so they can be swapped in one place. */
const SINGLE_IMPORTER: Record<string, string> = {
  'clipper2-ts': 'geometry/clip.ts',
  '@resvg/resvg-js': 'render-svg/png.ts',
};

/** Modules that must run in a browser, a worker and Node alike: no Node or DOM APIs. */
const PORTABLE = ['core', 'geometry', 'catalog', 'rules', 'layout', 'capture'];

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

// ---- app/ (docs/ARCHITECTURE.md section 9) ----

const APP = resolve(import.meta.dirname, '../../app');

/** Like files(), but also takes .tsx; a missing folder is an empty list. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const underDir = (file: string, dir: string): boolean => !posix(relative(dir, file)).startsWith('..');
const isNodeBuiltin = (spec: string): boolean => spec.startsWith('node:') || builtinModules.includes(spec) || builtinModules.includes(spec.split('/')[0]!);

describe('architecture: app/', () => {
  const MAIN = join(APP, 'main');
  const PRELOAD = join(APP, 'preload');
  const RENDERER = join(APP, 'renderer');
  const all = sourceFiles(APP);
  const rel = (f: string): string => posix(relative(APP, f));
  const relativeTargets = (file: string): string[] => imports(file).filter((s) => s.startsWith('.')).map((s) => resolve(file, '..', s));

  it('app has the known parts', () => {
    const folders = existsSync(APP) ? readdirSync(APP, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
    for (const f of folders) expect(['main', 'preload', 'renderer'], f).toContain(f);
    expect(folders).toContain('main');
    expect(folders).toContain('renderer');
  });

  it('the renderer never imports Node or Electron', () => {
    const violations: string[] = [];
    for (const file of all.filter((f) => underDir(f, RENDERER))) {
      for (const spec of imports(file)) {
        if (spec === 'electron' || isNodeBuiltin(spec)) violations.push(`${rel(file)} imports ${spec}`);
      }
      for (const target of relativeTargets(file)) {
        if (underDir(target, MAIN) || underDir(target, PRELOAD)) violations.push(`${rel(file)} reaches into main or preload`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('only main and the preload import electron', () => {
    const violations: string[] = [];
    for (const file of all) {
      const allowed = underDir(file, MAIN) || underDir(file, PRELOAD);
      if (!allowed && imports(file).includes('electron')) violations.push(`${rel(file)} imports electron`);
      if (!underDir(file, PRELOAD) && /\b(contextBridge|ipcRenderer)\b/.test(stripComments(readFileSync(file, 'utf8')))) {
        violations.push(`${rel(file)} uses contextBridge or ipcRenderer outside the preload`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('main never imports the renderer', () => {
    const violations = all
      .filter((f) => underDir(f, MAIN))
      .filter((f) => relativeTargets(f).some((t) => underDir(t, RENDERER)))
      .map((f) => `${rel(f)} imports the renderer`);
    expect(violations).toEqual([]);
  });

  it('src never imports app', () => {
    const violations = files(SRC)
      .filter((f) => relativeTargets(f).some((t) => underDir(t, APP)))
      .map((f) => `${posix(relative(SRC, f))} imports app/`);
    expect(violations).toEqual([]);
  });
});
