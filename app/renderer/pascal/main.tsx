/** Entry of Pascal's window (view3d://app/pascal/index.html). English only (owner, 2026-11-13). */
import './styles.css';
import { createRoot } from 'react-dom/client';
import { useGLTF } from '@react-three/drei';
import { createI18n, nodeRegistry, PascalI18nProvider, registerNode } from '@pascal-app/core';
import type { AnyNodeDefinition } from '@pascal-app/core';
import { registerBundledLocales } from '@pascal-app/editor/locales';
import { builtinPlugin } from '@pascal-app/nodes';
import { configureViewer, useViewer } from '@pascal-app/viewer';
import { PascalHost } from './host';
import { installPascalIcons } from './icons';
import { pascalViewerConfig } from './viewer-config';

// Every asset from the app's own folder: the page is at view3d://app/pascal/, the assets at view3d://app/.
const assets = pascalViewerConfig(new URL('../', window.location.href).href);
configureViewer(assets);
// One Pascal model (the site flag) is loaded with drei's `useGLTF(url, true)`, whose Draco decoder defaults to
// gstatic.com; point drei's default at the bundled copy too.
useGLTF.setDecoderPath(assets.decoders.dracoPath);
installPascalIcons();
for (const definition of builtinPlugin.nodes ?? []) {
  const node = definition as AnyNodeDefinition;
  if (!nodeRegistry.has(node.kind)) registerNode(node);
}
registerBundledLocales();
// Pascal picks feet from the computer's time zone; the shop is measured in metres.
useViewer.getState().setUnit('metric');
// No textures in this batch (decisions/0008): three's texture decoder (Basis) needs eval, which the page's CSP
// forbids, and the texture files' licence is not verified, so none is bundled. Pascal draws plain surfaces.
useViewer.getState().setTextures(false);

const root = document.getElementById('root');
if (root === null) throw new Error('pascal/main.tsx: the #root element is missing from index.html');
// No StrictMode: it would start Pascal's renderer twice.
createRoot(root).render(
  <PascalI18nProvider i18n={createI18n({ locale: 'en' })}>
    <PascalHost />
  </PascalI18nProvider>,
);
