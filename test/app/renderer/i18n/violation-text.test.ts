/** Issue M3-3: `violationText` words a violation from its code, in English and Arabic. */
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { violationText } from '../../../../app/renderer/i18n/messages';
import ar from '../../../../app/renderer/i18n/ar.json';
import en from '../../../../app/renderer/i18n/en.json';
import { validateLayout } from '../../../../src/rules/index';
import { violationCases } from '../../../fixtures/violation-cases';

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

/** Every number in the English sentence, as digits. */
const numbers = (text: string): string[] => text.match(/\d+/g) ?? [];

describe('violationText', () => {
  for (const c of violationCases) {
    const violationOf = () => {
      const v = validateLayout(c.doc).find(
        (x) => x.rule === c.rule && x.placementIds[0] === c.first && (c.openingId === undefined || x.openingId === c.openingId),
      );
      expect(v, `no ${c.rule} violation for ${c.first}`).toBeDefined();
      return v!;
    };

    it(`${c.name}: in English it is the engine's own message`, async () => {
      const t = await tIn('en');
      expect(violationText(t, c.doc, violationOf())).toBe(c.expected.message);
    });

    it(`${c.name}: in Arabic it is another text with the same digits and the fixture ids`, async () => {
      const t = await tIn('ar');
      const text = violationText(t, c.doc, violationOf());
      expect(text).not.toBe(c.expected.message);
      expect(text).not.toContain('{{');
      expect(/[٠-٩]/.test(text)).toBe(false);
      for (const n of numbers(c.expected.message.replace(/"[^"]*"|\([^)]*\)/g, ''))) expect(text, `digits ${n}`).toContain(n);
      for (const id of c.expected.placementIds) expect(text, `id ${id}`).toContain(id);
    });
  }
});
