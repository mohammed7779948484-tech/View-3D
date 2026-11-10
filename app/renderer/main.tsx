import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './app';
import { i18n } from './i18n';

document.documentElement.lang = i18n.language;
document.documentElement.dir = i18n.dir();

const root = document.getElementById('root');
if (root === null) throw new Error('main.tsx: the #root element is missing from index.html');
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
