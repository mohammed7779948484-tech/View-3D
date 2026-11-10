/** The only things the renderer may ask of the main process (exposed by the preload as `window.view3d`). */
export type OpenResult = { status: 'cancelled' } | { status: 'opened'; fileName: string; text: string } | { status: 'failed'; message: string };
export type SaveRequest = { text: string; mode: 'save' | 'save-as' };
export type SaveResult = { status: 'cancelled' } | { status: 'saved'; fileName: string } | { status: 'failed'; message: string };
export type ProjectBridge = {
  /** Asks for a project file with the native dialog and returns its text. */
  openProject(): Promise<OpenResult>;
  /** Writes the text to the current file ('save', asks if there is none) or to a new one ('save-as'). */
  saveProject(request: SaveRequest): Promise<SaveResult>;
  /** Called when the owner closes the window; returns a function that stops listening. */
  onCloseRequested(listener: () => void): () => void;
  /** Closes the window without asking again. */
  closeWindow(): void;
};
