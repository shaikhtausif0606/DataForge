const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startResearch: () => ipcRenderer.invoke('research:start'),
  endResearch: () => ipcRenderer.invoke('research:end'),
  getSessions: () => ipcRenderer.invoke('research:get-sessions'),
  getSessionData: (sessionId) => ipcRenderer.invoke('research:get-session-data', sessionId),
  exportJSON: (sessionId) => ipcRenderer.invoke('research:export-json', sessionId),
  deleteCapture: (sessionId, captureId) => ipcRenderer.invoke('research:delete-capture', sessionId, captureId),
  addCapture: (sessionId, input) => ipcRenderer.invoke('research:add-capture', sessionId, input),
  deleteSession: (sessionId) => ipcRenderer.invoke('research:delete-session', sessionId),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window:maximize-change', (_event, isMaximized) => callback(isMaximized));
  },
  onCaptureUpdate: (callback) => {
    ipcRenderer.on('capture:new', (_event, data) => callback(data));
  },
  onSessionStatus: (callback) => {
    ipcRenderer.on('session:status', (_event, status) => callback(status));
  },
  onExtensionConnected: (callback) => {
    ipcRenderer.on('extension:connected', (_event, connected) => callback(connected));
  },
  onExtensionError: (callback) => {
    ipcRenderer.on('extension:error', (_event, msg) => callback(msg));
  },
  onResearchLog: (callback) => {
    ipcRenderer.on('research:log', (_event, msg) => callback(msg));
  },

  /* ─── AI Assistant ─── */
  getApiKey: () => ipcRenderer.invoke('ai:get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('ai:set-api-key', key),
  aiChat: (sessionId, messages) => ipcRenderer.invoke('ai:chat', sessionId, messages),

  /* ─── Settings ─── */
  settingsGet: (key) => ipcRenderer.invoke('settings:get', key),
  settingsSet: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  fetchModels: (apiKey, provider) => ipcRenderer.invoke('ai:fetch-models', apiKey, provider),

  /* ─── Chat Storage ─── */
  chatSave: (sessionId, messages) => ipcRenderer.invoke('chat:save', sessionId, messages),
  chatLoad: (sessionId) => ipcRenderer.invoke('chat:load', sessionId)
});
