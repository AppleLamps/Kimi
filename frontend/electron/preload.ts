import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getHomeDirectory: () => ipcRenderer.invoke('get-home-directory'),
});

declare global {
  interface Window {
    electronAPI: {
      selectDirectory: () => Promise<string | null>;
      getHomeDirectory: () => Promise<string>;
    };
  }
}
