/** Phase 1 of docs/decisions/0008: where Pascal's viewer finds its bundled assets (no remote URL). */
export type PascalViewerConfig = {
  assetsBaseUrl: string;
  sfxBaseUrl: string;
  iconsBaseUrl: string;
  decoders: { dracoPath: string; basisPath: string };
};

export function pascalViewerConfig(base: string): PascalViewerConfig {
  void base;
  throw new Error('not implemented');
}
