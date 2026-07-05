const WebSocket = require('ws');
const { saveCapture } = require('./storage');

let wss = null;
let mainWindow = null;
let currentSessionId = null;

function startServer(window, sessionId) {
  mainWindow = window;
  currentSessionId = sessionId;

  try {
    wss = new WebSocket.Server({ port: 9876, host: '127.0.0.1' });

    wss.on('listening', () => {
      console.log('[WS] Server listening on ws://127.0.0.1:9876');
    });

    wss.on('connection', (ws) => {
      console.log('[WS] Extension connected');
      notifyUI('extension:connected', true);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          switch (msg.type) {
            case 'capture':
              handleCapture(msg.payload);
              ws.send(JSON.stringify({ type: 'ack', payload: { captureId: msg.payload?.id } }));
              break;
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
          }
        } catch (e) {
          console.error('[WS] Error processing message:', e);
        }
      });

      ws.on('close', () => {
        console.log('[WS] Extension disconnected');
        notifyUI('extension:connected', false);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
      });

      ws.send(JSON.stringify({
        type: 'session_state',
        payload: { status: 'active', sessionId: currentSessionId }
      }));
    });

    wss.on('error', (err) => {
      console.error('[WS] Server error:', err.message);
      notifyUI('extension:error', err.message);
    });
  } catch (err) {
    console.error('[WS] Failed to start server:', err.message);
    throw err;
  }
}

function handleCapture(payload) {
  if (!payload) return;

  payload.sessionId = currentSessionId;

  try {
    saveCapture(currentSessionId, payload);
  } catch (err) {
    console.error('[WS] Save error:', err.message);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('capture:new', payload);
  }
}

function stopServer() {
  if (wss) {
    try {
      wss.clients.forEach(client => {
        try { client.close(); } catch (e) {}
      });
      wss.close();
    } catch (e) {
      console.error('[WS] Stop error:', e.message);
    }
    wss = null;
  }
}

function broadcast(data) {
  if (wss) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(msg); } catch (e) {}
      }
    });
  }
}

function notifyUI(event, value) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, value);
  }
}

module.exports = { startServer, stopServer, broadcast };
