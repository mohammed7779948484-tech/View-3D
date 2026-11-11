/**
 * Issue M3-6: `unplacedText` words the "did not fit" reason from the reason codes and counts, in the chosen language.
 *
 * ORACLE: in English the expected text is the engine's own `describeObstacles(obstacles, positionsTried, defaultConfig)`,
 * by design: that function IS the English sentence and the requirement is that the English text stays unchanged.
 * A few sentences are also written out by hand below. Arabic is checked by property (not English, no `{{`,
 * digits 0-9 only, every shown count present).
 */
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { unplacedText } from '../../../../app/renderer/i18n/messages';
import ar from '../../../../app/renderer/i18n/ar.json';
import en from '../../../../app/renderer/i18n/en.json';
import { describeObstacles } from '../../../../src/layout/index';
import type { ReasonCode, Unplaced } from '../../../../src/layout/index';
import { defaultConfig } from '../../../../src/rules/index';

async function tIn(lng: 'en' | 'ar') {
  const instance = i18next.createInstance();
  await instance.init({
    lng,
    initAsync: false,
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return instance.t.bind(instance);
}

// Every ReasonCode of src/layout/types.ts (16).
const allCodes: ReasonCode[] = [
  'unknown-size', 'outside-room', 'column', 'blocked-door', 'overlap', 'window-blocked', 'own-access', 'blocks-access',
  'faces-door', 'not-on-wall', 'aisle-too-narrow', 'unreachable', 'main-aisle', 'no-wall-long-enough', 'needs-partner', 'orphan',
];

function unplaced(obstacles: Partial<Record<ReasonCode, number>>, positionsTried: number): Unplaced {
  return {
    productId: 'p',
    variantId: 'v',
    name: 'Thing',
    quantity: 1,
    reason: describeObstacles(obstacles, positionsTried, defaultConfig),
    positionsTried,
    obstacles,
  };
}

type Case = { name: string; u: Unplaced; shown: number[] };
const cases: Case[] = [
  { name: 'no obstacles and 0 positions tried', u: unplaced({}, 0), shown: [] },
  { name: 'one cause and 1 position tried', u: unplaced({ overlap: 1 }, 1), shown: [1] },
  { name: 'one cause and several positions tried', u: unplaced({ column: 37 }, 37), shown: [37] },
  // Counts 9, 5, 5, 2: ordered by count then code: overlap 9, blocked-door 5, column 5; outside-room (2) is dropped.
  { name: 'four causes: only the top three, by count then code', u: unplaced({ column: 5, 'blocked-door': 5, overlap: 9, 'outside-room': 2 }, 21), shown: [9, 5, 5] },
  { name: 'three causes with counts', u: unplaced({ orphan: 11, 'needs-partner': 4, unreachable: 6 }, 25), shown: [11, 6, 4] },
  { name: 'own-access (secondary aisle 915 mm)', u: unplaced({ 'own-access': 8 }, 8), shown: [8, 915] },
  { name: 'aisle-too-narrow (secondary aisle 915 mm)', u: unplaced({ 'aisle-too-narrow': 13 }, 20), shown: [13, 915] },
  { name: 'main-aisle (1200 mm)', u: unplaced({ 'main-aisle': 6 }, 14), shown: [6, 1200] },
  ...allCodes.map((code, i) => ({
    name: `reason code ${code}`,
    u: unplaced({ [code]: i + 2 }, i + 30),
    shown: [i + 2, ...(code === 'own-access' || code === 'aisle-too-narrow' ? [915] : code === 'main-aisle' ? [1200] : [])],
  })),
];

describe('unplacedText in English', () => {
  it('has the sentences worded by hand (the engine words them the same way)', async () => {
    const t = await tIn('en');
    expect(unplacedText(t, unplaced({}, 0))).toBe('There was no wall or free floor left to try it on.');
    expect(unplacedText(t, unplaced({ overlap: 1 }, 1))).toBe('Tried 1 position. It failed because another fixture is already there (1).');
    expect(unplacedText(t, unplaced({ column: 37 }, 37))).toBe('Tried 37 positions. They failed because a column is in the way (37).');
    expect(unplacedText(t, unplaced({ 'main-aisle': 6 }, 14))).toBe(
      'Tried 14 positions. They failed because it would narrow the main aisle to the counter below 1200 mm (6).',
    );
  });

  for (const c of cases) {
    it(`${c.name}: is the engine's own sentence`, async () => {
      const t = await tIn('en');
      expect(unplacedText(t, c.u)).toBe(describeObstacles(c.u.obstacles, c.u.positionsTried, defaultConfig));
    });
  }

  it('the unknown-size report is its own reason, word for word', async () => {
    const t = await tIn('en');
    const u: Unplaced = {
      productId: 'p',
      variantId: 'v',
      name: 'Thing',
      quantity: 2,
      reason: 'Its dimensions are not known yet, so it cannot be placed. Confirm the size first.',
      positionsTried: 0,
      obstacles: { 'unknown-size': 2 },
    };
    expect(unplacedText(t, u)).toBe(u.reason);
  });
});

describe('unplacedText in Arabic', () => {
  for (const c of cases) {
    it(`${c.name}: is another text with digits 0-9 and every count`, async () => {
      const t = await tIn('ar');
      const text = unplacedText(t, c.u);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toBe(describeObstacles(c.u.obstacles, c.u.positionsTried, defaultConfig));
      expect(text).not.toContain('{{');
      expect(/[٠-٩]/.test(text)).toBe(false);
      for (const n of c.shown) expect(text, `count ${n}`).toContain(String(n));
      if (c.u.positionsTried > 0 && c.shown.length > 0) expect(text, 'positions tried').toContain(String(c.u.positionsTried));
    });
  }

  it('the unknown-size report is worded in Arabic too', async () => {
    const t = await tIn('ar');
    const u: Unplaced = {
      productId: 'p',
      variantId: 'v',
      name: 'Thing',
      quantity: 2,
      reason: 'Its dimensions are not known yet, so it cannot be placed. Confirm the size first.',
      positionsTried: 0,
      obstacles: { 'unknown-size': 2 },
    };
    const text = unplacedText(t, u);
    expect(text).not.toBe(u.reason);
    expect(text).not.toContain('{{');
    expect(/[٠-٩]/.test(text)).toBe(false);
    expect(text).toContain('2');
  });
});
