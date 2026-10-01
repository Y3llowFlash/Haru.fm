const { contextBridge, ipcRenderer } = require('electron');

// A named, narrow bridge. Never expose ipcRenderer, filesystem APIs, or arbitrary channels.
contextBridge.exposeInMainWorld('haru', Object.freeze({
  getPreferences: () => ipcRenderer.invoke('haru:preferences:get'),
  savePreferences: (preferences) => ipcRenderer.invoke('haru:preferences:save', preferences),
  setMode: (mode) => ipcRenderer.invoke('haru:mode', mode),
  setPinned: (pinned) => ipcRenderer.invoke('haru:pin', pinned),
  minimize: () => ipcRenderer.invoke('haru:minimize'),
  close: () => ipcRenderer.invoke('haru:close'),
  openYouTube: (url) => ipcRenderer.invoke('haru:open-youtube', url),
  getVideoMetadata: (videoId) => ipcRenderer.invoke('haru:metadata', videoId),
  onSuspendChange(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, suspended) => callback(suspended === true);
    ipcRenderer.on('haru:suspend', listener);
    return () => ipcRenderer.removeListener('haru:suspend', listener);
  },
}));
