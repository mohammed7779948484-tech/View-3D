/** SVG to PNG. Node only (native module); keep it out of anything that must run in a browser. */
import { Resvg } from '@resvg/resvg-js';

export function svgToPng(svg: string, widthPx = 2000): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: widthPx },
    background: '#ffffff',
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  })
    .render()
    .asPng();
}
