/** Starts one layout run in its own worker; `cancel` ends the worker and the result never arrives. */
import type { LayoutRequest } from '../../../src/layout/index';

export type WorkerMessage = { type: 'progress'; done: number; total: number } | { type: 'result'; text: string };
export type LayoutRun = { result: Promise<string>; cancel(): void };

export function runLayout(request: LayoutRequest, onProgress?: (done: number, total: number) => void): LayoutRun {
  const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
  const result = new Promise<string>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === 'progress') return onProgress?.(event.data.done, event.data.total);
      worker.terminate();
      resolve(event.data.text);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`layout worker: ${event.message}`));
    };
  });
  worker.postMessage(request);
  return { result, cancel: () => worker.terminate() };
}
