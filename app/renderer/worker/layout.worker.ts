/**
 * Runs the layout engine off the UI thread. It answers with the JSON text of the result, so the
 * page receives exactly the bytes `autoLayout` produced (decisions/0006).
 */
import { autoLayout } from '../../../src/layout/index';
import type { LayoutRequest } from '../../../src/layout/index';

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  self.postMessage(JSON.stringify(autoLayout(event.data)));
};
