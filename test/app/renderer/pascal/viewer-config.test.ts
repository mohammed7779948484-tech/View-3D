/** Phase 1 of docs/decisions/0008: Pascal's viewer reads every asset from the bundled view3d://app/ folder. */
import { describe, expect, it } from 'vitest';
import { pascalViewerConfig } from '../../../../app/renderer/pascal/viewer-config';

const expected = {
  assetsBaseUrl: 'view3d://app',
  sfxBaseUrl: 'view3d://app/audios/sfx',
  iconsBaseUrl: 'view3d://app/icons',
  decoders: { dracoPath: 'view3d://app/decoders/draco/', basisPath: 'view3d://app/decoders/basis/' },
};

describe('pascalViewerConfig', () => {
  it('points every asset at view3d://app/', () => {
    expect(pascalViewerConfig('view3d://app/')).toEqual(expected);
  });

  it('gives the same result without the trailing slash', () => {
    expect(pascalViewerConfig('view3d://app')).toEqual(expected);
  });

  it('never names a remote url, and the decoder paths end with a slash', () => {
    const c = pascalViewerConfig('view3d://app/');
    const all = [c.assetsBaseUrl, c.sfxBaseUrl, c.iconsBaseUrl, c.decoders.dracoPath, c.decoders.basisPath];
    for (const v of all) expect(/^https?:/.test(v), v).toBe(false);
    expect(c.decoders.dracoPath.endsWith('/')).toBe(true);
    expect(c.decoders.basisPath.endsWith('/')).toBe(true);
  });
});
