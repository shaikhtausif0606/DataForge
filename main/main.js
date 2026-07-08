const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const wsServer = require('./ws-server');
const storage = require('./storage');
const browserLauncher = require('./browser-launcher');
const llmService = require('./llm-service');
const chatStore = require('./chat-store');
const settings = require('./settings-store');

let mainWindow;
let chromeProcess = null;
let currentSessionId = null;

const logFile = path.join(__dirname, '..', 'debug.log');
function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line, 'utf-8');
  console.log(msg);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    frame: false,
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximize-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximize-change', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ─── IPC Handlers ─── */

ipcMain.handle('research:start', async () => {
  currentSessionId = 'RS-' + Date.now();
  debugLog('[Research] Starting session: ' + currentSessionId);

  try {
    wsServer.startServer(mainWindow, currentSessionId);
    debugLog('[Research] WebSocket server started on port 9876');
  } catch (err) {
    debugLog('[Research] WebSocket server error: ' + err.message);
  }

  browserLauncher.closeExistingChrome();

  try {
    debugLog('[Research] Calling browserLauncher.launchBrowser()...');
    const result = await browserLauncher.launchBrowser();
    chromeProcess = result;
    debugLog('[Research] Chrome launched SUCCESSFULLY, PID: ' + result.pid + ', path: ' + result.path);
    if (mainWindow) {
      mainWindow.webContents.send('research:log', 'Chrome launched successfully (PID: ' + result.pid + ')');
    }
  } catch (err) {
    debugLog('[Research] Chrome launch FAILED: ' + err.message);
    if (mainWindow) {
      mainWindow.webContents.send('research:log', 'Chrome launch failed: ' + err.message);
    }
    dialog.showErrorBox('Chrome Launch Failed',
      'Could not launch Chrome.\n' + err.message + '\n\nPlease make sure Google Chrome is installed.');
  }

  return currentSessionId;
});

ipcMain.handle('research:end', async () => {
  wsServer.broadcast({ type: 'session_state', payload: { status: 'ended' } });
  wsServer.stopServer();

  if (chromeProcess && chromeProcess.pid) {
    try {
      debugLog('[Research] Killing Chrome process PID: ' + chromeProcess.pid);
      if (process.platform === 'win32') {
        execSync('taskkill /PID ' + chromeProcess.pid + ' /F', { timeout: 5000 });
      } else {
        execSync('kill -9 ' + chromeProcess.pid, { timeout: 5000 });
      }
      debugLog('[Research] Chrome process killed');
    } catch (err) {
      debugLog('[Research] Error killing Chrome: ' + err.message);
    }
  }

  chromeProcess = null;
  currentSessionId = null;
  return { ok: true };
});

ipcMain.handle('research:get-sessions', async () => {
  return storage.getSessions();
});

ipcMain.handle('research:get-session-data', async (_event, sessionId) => {
  return storage.getSessionData(sessionId);
});

ipcMain.handle('research:delete-capture', async (_event, sessionId, captureId) => {
  return storage.deleteCapture(sessionId, captureId);
});

ipcMain.handle('research:add-capture', async (_event, sessionId, input) => {
  if (!sessionId) throw new Error('No session selected');

  const capture = {
    id: 'capt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toISOString(),
    url: (input.url && input.url.trim()) || 'manual://local-entry',
    pageTitle: (input.pageTitle && input.pageTitle.trim()) || 'Untitled',
    type: 'manual',
    data: { text: input.text || '' },
    sessionId,
    manual: true
  };

  storage.saveCapture(sessionId, capture);
  return capture;
});

ipcMain.handle('research:delete-session', async (_event, sessionId) => {
  return storage.deleteSession(sessionId);
});

/* ─── AI Assistant ─── */

ipcMain.handle('ai:get-api-key', async () => {
  return llmService.getApiKey();
});

ipcMain.handle('ai:set-api-key', async (_event, key) => {
  llmService.setApiKey(key);
  return true;
});

ipcMain.handle('ai:chat', async (_event, sessionId, messages) => {
  const data = await storage.getSessionData(sessionId);
  return llmService.chat(data, messages);
});

/* ─── Settings ─── */

ipcMain.handle('settings:get', async (_event, key) => {
  return settings.get(key);
});

ipcMain.handle('settings:set', async (_event, key, value) => {
  return settings.set(key, value);
});

ipcMain.handle('ai:fetch-models', async (_event, apiKey, provider) => {
  if (provider === 'openrouter') {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const req = https.get('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: 'Bearer ' + apiKey }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const models = (json.data || []).map(m => ({
              id: m.id,
              name: m.name || m.id
            }));
            resolve(models);
          } catch (e) {
            reject(new Error('Failed to parse models: ' + e.message));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  } else {
    const models = [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ];
    return models;
  }
});

/* ─── Chat Storage ─── */

ipcMain.handle('chat:save', async (_event, sessionId, messages) => {
  return chatStore.saveConversation(sessionId, messages);
});

ipcMain.handle('chat:load', async (_event, sessionId) => {
  return chatStore.loadConversation(sessionId);
});

/* ─── Window Controls ─── */

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('research:export-json', async (_event, sessionId) => {
  const jsonStr = storage.exportSessionJSON(sessionId);

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${sessionId || 'research'}-data.json`,
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (filePath) {
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
    return { ok: true, path: filePath };
  }

  return { ok: false };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  wsServer.stopServer();
});
