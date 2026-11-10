/** The narrow bridge: four functions, no Node and no raw ipcRenderer for the renderer (decisions/0007). */
import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectBridge, SaveRequest } from '../shared/project-api';

const bridge: ProjectBridge = {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (request: SaveRequest) => ipcRenderer.invoke('project:save', { text: request.text, mode: request.mode }),
  onCloseRequested(listener) {
    const handler = (): void => listener();
    ipcRenderer.on('window:close-requested', handler);
    return () => {
      ipcRenderer.removeListener('window:close-requested', handler);
    };
  },
  closeWindow: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('view3d', bridge);
