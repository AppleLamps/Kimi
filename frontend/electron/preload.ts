import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getHomeDirectory: () => ipcRenderer.invoke('get-home-directory'),
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    upsert: (record: unknown) => ipcRenderer.invoke('sessions:upsert', record),
    remove: (sessionId: string) => ipcRenderer.invoke('sessions:delete', sessionId),
    export: (record: unknown) => ipcRenderer.invoke('sessions:export', record),
    import: () => ipcRenderer.invoke('sessions:import'),
  },
  library: {
    get: () => ipcRenderer.invoke('library:get'),
    save: (library: unknown) => ipcRenderer.invoke('library:save', library),
  },
});

declare global {
  interface Window {
    electronAPI: {
      selectDirectory: () => Promise<string | null>;
      getHomeDirectory: () => Promise<string>;
      sessions?: {
        list: () => Promise<unknown[]>;
        upsert: (record: unknown) => Promise<void>;
        remove: (sessionId: string) => Promise<void>;
        export: (record: unknown) => Promise<string | null>;
        import: () => Promise<unknown | null>;
      };
      library: {
        get: () => Promise<any>;
        save: (library: any) => Promise<void>;
      };
    };
  }
}
