/** The narrow bridge: eight functions, no Node and no raw ipcRenderer for the renderer (decisions/0007). */
import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectBridge, SaveRequest } from '../shared/project-api';

const bridge: ProjectBridge = {
  openProject: () => ipcRenderer.invoke('project:open'),
  openScan: () => ipcRenderer.invoke('scan:open'),
  saveProject: (request: SaveRequest) => ipcRenderer.invoke('project:save', { text: request.text, mode: request.mode }),
  onCloseRequested(listener) {
    const handler = (): void => listener();
    ipcRenderer.on('window:close-requested', handler);
    return () => {
      ipcRenderer.removeListener('window:close-requested', handler);
    };
  },
  closeWindow: () => ipcRenderer.send('window:close'),
  loadCatalog: () => ipcRenderer.invoke('catalog:load'),
  saveCatalog: (text: string) => ipcRenderer.invoke('catalog:save', text),
  openPascal: () => ipcRenderer.send('pascal:open'),
};

contextBridge.exposeInMainWorld('view3d', bridge);
