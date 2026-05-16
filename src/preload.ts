import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('microslop', {
  startCapture: () => ipcRenderer.invoke('capture:start'),
  pauseCapture: () => ipcRenderer.invoke('capture:pause'),
  captureNow: () => ipcRenderer.invoke('capture:now'),
  getCaptureState: () => ipcRenderer.invoke('capture:state'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
});
