const fs = require('fs');
const path = require('path');

const CHATS_DIR = path.join(__dirname, '..', 'data', 'chats');

function ensureDir() {
  if (!fs.existsSync(CHATS_DIR)) {
    fs.mkdirSync(CHATS_DIR, { recursive: true });
  }
}

function saveConversation(sessionId, messages) {
  try {
    ensureDir();
    const filePath = path.join(CHATS_DIR, sessionId + '.json');
    fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

function loadConversation(sessionId) {
  try {
    const filePath = path.join(CHATS_DIR, sessionId + '.json');
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

module.exports = { saveConversation, loadConversation };
