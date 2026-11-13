/** Phase 1 of docs/decisions/0008: where Pascal's viewer finds its bundled assets (no remote URL). */
export type PascalViewerConfig = {
  assetsBaseUrl: string;
  sfxBaseUrl: string;
  iconsBaseUrl: string;
  decoders: { dracoPath: string; basisPath: string };
};

/**
 * Pascal's defaults point at its own servers (editor.pascal.app, gstatic.com, jsdelivr.net). Every one is
 * replaced with a folder of the app: textures and icons from app/renderer/public, decoders copied from three.
 */
export function pascalViewerConfig(base: string): PascalViewerConfig {
  const root = base.replace(/\/+$/, '');
  return {
    assetsBaseUrl: root,
    sfxBaseUrl: `${root}/audios/sfx`,
    iconsBaseUrl: `${root}/icons`,
    decoders: { dracoPath: `${root}/decoders/draco/`, basisPath: `${root}/decoders/basis/` },
  };
}
