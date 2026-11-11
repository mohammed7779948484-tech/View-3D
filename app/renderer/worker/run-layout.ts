/** Starts one layout run in its own worker; `cancel` ends the worker and the result never arrives. */
import type { LayoutRequest } from '../../../src/layout/index';

export type LayoutRun = { result: Promise<string>; cancel(): void };

export function runLayout(request: LayoutRequest): LayoutRun {
  const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
  const result = new Promise<string>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<string>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`layout worker: ${event.message}`));
    };
  });
  worker.postMessage(request);
  return { result, cancel: () => worker.terminate() };
}
