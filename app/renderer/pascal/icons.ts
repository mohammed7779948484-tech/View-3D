/**
 * Pascal's editor draws some icons with Iconify, which by default downloads them from api.iconify.design. The ones
 * it uses are bundled at build time (`virtual:pascal-icons`, electron.vite.config.ts), and fetching is switched off:
 * an icon missing from icon-names.json shows blank and is reported in the console instead of going online.
 */
import { _api, addCollection } from '@iconify/react';
import { pascalIcons } from 'virtual:pascal-icons';

export function installPascalIcons(): void {
  for (const set of pascalIcons) addCollection(set);
  _api.setFetch((input) => {
    console.error(`[pascal] icon not bundled, not fetched: ${String(input)}`);
    return Promise.reject(new Error('Pascal icons are bundled; nothing is fetched'));
  });
}
