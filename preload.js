const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexvolt', {
  isNative: true,
  platform: process.platform,
  getSystemInfo: () => ipcRenderer.invoke('system-info'),
  detectGames: () => ipcRenderer.invoke('detect-games'),
  applyOperation: (id, context) => ipcRenderer.invoke('apply-operation', id, context || {}),
  restoreBackup: (id) => ipcRenderer.invoke('restore-backup', id),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  isAdmin: () => ipcRenderer.invoke('is-admin')
});
