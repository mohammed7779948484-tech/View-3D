import { useTranslation } from 'react-i18next';

/** The start screen: no document exists until a room does (owner ruling 2026-11-11). */
export function App() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('start.noProject')}</p>
    </main>
  );
}
