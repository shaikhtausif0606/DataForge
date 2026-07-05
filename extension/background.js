let ws = null;
let reconnectTimer = null;
const WS_URL = 'ws://127.0.0.1:9876';

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[Research Ext] Connected to Electron');
    chrome.storage.local.set({ connected: true });
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('[Research Ext] Invalid message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[Research Ext] Disconnected');
    chrome.storage.local.set({ connected: false });
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'ack':
      console.log('[Research Ext] Capture acknowledged:', msg.payload?.captureId);
      break;
    case 'session_state':
      if (msg.payload?.status === 'ended') {
        chrome.storage.local.set({ sessionActive: false });
      }
      break;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'capture':
      send({
        type: 'capture',
        payload: message.payload
      });
      sendResponse({ ok: true });
      break;
    case 'get_connection_status':
      sendResponse({ connected: ws?.readyState === WebSocket.OPEN });
      break;
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.runtime.openOptionsPage();
});

connect();
