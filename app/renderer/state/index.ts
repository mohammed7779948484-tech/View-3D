/** The app's one document store, and the React hook that reads it. */
import { useSyncExternalStore } from 'react';
import { createDocumentStore } from './document-store';
import type { DocumentState } from './document-store';

export const documentStore = createDocumentStore(null);

export function useDocumentState(): DocumentState {
  return useSyncExternalStore(documentStore.subscribe, documentStore.getState);
}
