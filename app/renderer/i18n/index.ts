/** Every UI string goes through `t()` from here. English only until Arabic arrives (M2 issue 9). */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en }, ar: { translation: ar } },
  // Strings are bundled, so there is nothing to wait for.
  initAsync: false,
  // React escapes text itself.
  interpolation: { escapeValue: false },
});

export type Language = 'en' | 'ar';
/** Each language named in itself, so the owner finds his own whichever is showing. */
export const LANGUAGES: readonly { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
];

/** The page follows the language: Arabic runs right to left; the plan itself is never mirrored. */
export function showLanguage(): void {
  document.documentElement.lang = i18n.language;
  document.documentElement.dir = i18n.dir();
}
i18n.on('languageChanged', showLanguage);
