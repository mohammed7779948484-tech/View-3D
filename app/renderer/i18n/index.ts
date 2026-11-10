/** Every UI string goes through `t()` from here. English only until Arabic arrives (M2 issue 9). */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  // Strings are bundled, so there is nothing to wait for.
  initAsync: false,
  // React escapes text itself.
  interpolation: { escapeValue: false },
});
