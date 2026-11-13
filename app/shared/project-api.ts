/** The only things the renderer may ask of the main process (exposed by the preload as `window.view3d`). */
export type OpenResult =
  | { status: 'cancelled' }
  | { status: 'opened'; fileName: string; text: string }
  | { status: 'failed'; code: 'read-failed'; fileName: string; message: string };
export type SaveRequest = { text: string; mode: 'save' | 'save-as' };
export type SaveResult =
  | { status: 'cancelled' }
  | { status: 'saved'; fileName: string }
  | { status: 'failed'; code: 'write-failed'; fileName: string; message: string };
export type ProjectBridge = CatalogBridge & {
  /** Asks for a project file with the native dialog and returns its text. */
  openProject(): Promise<OpenResult>;
  /** Asks for a room-scan file with the native dialog and returns its text; it never becomes the project file. */
  openScan(): Promise<OpenResult>;
  /** Writes the text to the current file ('save', asks if there is none) or to a new one ('save-as'). */
  saveProject(request: SaveRequest): Promise<SaveResult>;
  /** Called when the owner closes the window; returns a function that stops listening. */
  onCloseRequested(listener: () => void): () => void;
  /** Closes the window without asking again. */
  closeWindow(): void;
  /** Opens Pascal's editor in its own window, or brings it forward (decisions/0008, phase 1). */
  openPascal(): void;
};

/** The owner's catalog file (`<userData>/catalog.json`); created from the website seed on first start. */
export type CatalogLoadResult = { status: 'loaded'; text: string } | { status: 'failed'; code: 'read-failed' | 'not-a-catalog'; message: string };
export type CatalogSaveResult = { status: 'saved' } | { status: 'failed'; code: 'not-a-catalog' | 'write-failed'; message: string };
export type CatalogBridge = {
  /** The catalog file's text; a file that is not a valid catalog is reported and never rewritten. */
  loadCatalog(): Promise<CatalogLoadResult>;
  /** Replaces the catalog file with this text, only when it is a valid catalog. */
  saveCatalog(text: string): Promise<CatalogSaveResult>;
};
