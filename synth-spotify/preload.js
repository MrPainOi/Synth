const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window-state-change', (event, isMaximized) => callback(isMaximized));
  }
});
