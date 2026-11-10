/**
 * Scout spikes: one working proof per adopted library (see docs/STACK.md).
 * If a library upgrade breaks one of these, the upgrade is rejected.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'electron-vite';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import fc from 'fast-check';
import { z } from 'zod';
import { produce } from 'immer';
import { Resvg } from '@resvg/resvg-js';
import { area, difference, FillRule, inflatePaths, intersect, JoinType, EndType } from 'clipper2-ts';

describe('spike: clipper2-ts (integer polygon offset + boolean)', () => {
  // 10 m x 10 m square in micrometres, counter-clockwise.
  const M = 1_000_000;
  const square = [
    { x: 0, y: 0 },
    { x: 10 * M, y: 0 },
    { x: 10 * M, y: 10 * M },
    { x: 0, y: 10 * M },
  ];

  it('insets a square by 1 m exactly with miter joins', () => {
    const inset = inflatePaths([square], -1 * M, JoinType.Miter, EndType.Polygon);
    expect(inset).toHaveLength(1);
    expect(Math.abs(area(inset[0]!))).toBe(8 * M * (8 * M));
  });

  it('computes intersection and difference areas exactly', () => {
    const other = square.map((p) => ({ x: p.x + 5 * M, y: p.y + 5 * M }));
    const inter = intersect([square], [other], FillRule.NonZero);
    expect(Math.abs(area(inter[0]!))).toBe(25 * M * M);
    const diff = difference([square], [other], FillRule.NonZero);
    expect(Math.abs(area(diff[0]!))).toBe(75 * M * M);
  });
});

describe('spike: zod 4', () => {
  it('validates and rejects', () => {
    const Len = z.number().int().nonnegative();
    expect(Len.safeParse(25_400).success).toBe(true);
    expect(Len.safeParse(1.5).success).toBe(false);
  });
});

describe('spike: fast-check', () => {
  it('runs a property with a fixed seed', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { seed: 42, numRuns: 50 },
    );
  });
});

describe('spike: @resvg/resvg-js (SVG to PNG)', () => {
  it('renders an SVG to a PNG of the requested width', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#fff"/><rect x="10" y="10" width="30" height="20" fill="#06c"/></svg>';
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 400 } }).render();
    expect(png.width).toBe(400);
    expect(png.height).toBe(200);
    expect(Array.from(png.asPng().subarray(1, 4))).toEqual([0x50, 0x4e, 0x47]); // "PNG"
  });
});

describe('spike: electron-vite 6 (build main, preload, renderer)', () => {
  const dir = resolve(import.meta.dirname, 'electron-vite-app');
  it('builds the three targets with a CommonJS preload and relative renderer paths', async () => {
    rmSync(join(dir, 'out'), { recursive: true, force: true });
    await build({ configFile: join(dir, 'electron.vite.config.mjs'), root: dir });
    expect(existsSync(join(dir, 'out/main/index.js'))).toBe(true);
    expect(existsSync(join(dir, 'out/preload/index.cjs'))).toBe(true);
    const html = readFileSync(join(dir, 'out/renderer/index.html'), 'utf8');
    expect(html).toMatch(/<script[^>]*src="\.\/assets\//);
    expect(readFileSync(join(dir, 'out/preload/index.cjs'), 'utf8')).toContain('require("electron")');
  }, 120_000);
});

describe('spike: i18next + react-i18next', () => {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    lng: 'en',
    initAsync: false,
    resources: { en: { translation: { start: { noProject: 'No project is open.' } } } },
  });

  it('renders a translated string and knows text direction', () => {
    const Hello = () => createElement('p', null, useTranslation().t('start.noProject'));
    const html = renderToString(createElement(I18nextProvider, { i18n: instance }, createElement(Hello)));
    expect(html).toContain('No project is open.');
    expect(instance.dir('ar')).toBe('rtl');
    expect(instance.dir('en')).toBe('ltr');
  });
});

describe('spike: immer 11 (structural sharing, frozen, replacement)', () => {
  type Base = { a: { x: number }; b: { y: number } };
  const make = (): Base => ({ a: { x: 1 }, b: { y: 1 } });

  it('shares untouched subtrees and freezes the result', () => {
    const base = make();
    const result = produce(base, (d) => {
      d.a.x = 2;
    });
    expect(result).not.toBe(base);
    expect(result.a.x).toBe(2);
    expect(base.a.x).toBe(1);
    expect(result.b).toBe(base.b);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.a)).toBe(true);
  });

  it('returns the same reference when the recipe changes nothing', () => {
    const base = make();
    expect(produce(base, () => {})).toBe(base);
  });

  it('replaces the root when the recipe returns a new object', () => {
    const base = make();
    const next: Base = { a: { x: 9 }, b: { y: 9 } };
    expect(produce(base, () => next)).toBe(next);
  });
});
