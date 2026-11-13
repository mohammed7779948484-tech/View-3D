/**
 * Runs the layout engine off the UI thread. It reports progress after each block of the search and
 * answers with the JSON text of the result, so the page receives exactly the bytes `autoLayout`
 * produced (decisions/0006).
 */
import { autoLayout } from '../../../src/layout/index';
import type { LayoutRequest } from '../../../src/layout/index';
import type { WorkerMessage } from './run-layout';

const post = (message: WorkerMessage): void => self.postMessage(message);

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const result = autoLayout(event.data, { onProgress: (done, total) => post({ type: 'progress', done, total }) });
  post({ type: 'result', text: JSON.stringify(result) });
};
