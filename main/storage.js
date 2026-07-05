const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'sessions');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSessionDir(sessionId) {
  return path.join(DATA_DIR, sessionId);
}

function saveCapture(sessionId, capture) {
  const sessionDir = getSessionDir(sessionId);
  ensureDir(sessionDir);

  const pagesDir = path.join(sessionDir, 'pages');
  ensureDir(pagesDir);

  const urlSlug = capture.url
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 64);
  const pageFile = path.join(pagesDir, `${urlSlug}.json`);

  let pageData = [];
  if (fs.existsSync(pageFile)) {
    try {
      pageData = JSON.parse(fs.readFileSync(pageFile, 'utf-8'));
    } catch (e) {
      pageData = [];
    }
  }

  pageData.push(capture);
  fs.writeFileSync(pageFile, JSON.stringify(pageData, null, 2));

  updateMeta(sessionDir, capture);
}

function updateMeta(sessionDir, capture) {
  const metaFile = path.join(sessionDir, 'meta.json');
  let meta = { id: path.basename(sessionDir), captureCount: 0, pages: {}, lastCapture: null };

  if (fs.existsSync(metaFile)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    } catch (e) {}
  }

  meta.captureCount = (meta.captureCount || 0) + 1;
  meta.lastCapture = capture.timestamp;
  const domain = new URL(capture.url).hostname;
  meta.pages[domain] = (meta.pages[domain] || 0) + 1;

  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
}

function getSessionData(sessionId) {
  const sessionDir = getSessionDir(sessionId);
  if (!fs.existsSync(sessionDir)) return [];

  const pagesDir = path.join(sessionDir, 'pages');
  if (!fs.existsSync(pagesDir)) return [];

  const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.json'));
  let allCaptures = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(pagesDir, file), 'utf-8'));
      allCaptures = allCaptures.concat(data);
    } catch (e) {}
  }

  allCaptures.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return allCaptures;
}

function getSessions() {
  if (!fs.existsSync(DATA_DIR)) return [];

  const dirs = fs.readdirSync(DATA_DIR).filter(d => {
    const metaPath = path.join(DATA_DIR, d, 'meta.json');
    return fs.existsSync(metaPath);
  });

  return dirs.map(d => {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, d, 'meta.json'), 'utf-8'));
      return meta;
    } catch (e) {
      return { id: d, captureCount: 0, pages: {} };
    }
  }).sort((a, b) => {
    return (b.lastCapture || '') > (a.lastCapture || '') ? 1 : -1;
  });
}

function exportSessionJSON(sessionId) {
  const data = getSessionData(sessionId);
  const metaFile = path.join(getSessionDir(sessionId), 'meta.json');
  let meta = {};
  if (fs.existsSync(metaFile)) {
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch (e) {}
  }

  return JSON.stringify({ meta, captures: data }, null, 2);
}

function deleteSession(sessionId) {
  const sessionDir = getSessionDir(sessionId);
  if (!fs.existsSync(sessionDir)) return false;
  fs.rmSync(sessionDir, { recursive: true, force: true });
  return true;
}

function deleteCapture(sessionId, captureId) {
  const sessionDir = getSessionDir(sessionId);
  if (!fs.existsSync(sessionDir)) return false;

  const pagesDir = path.join(sessionDir, 'pages');
  if (!fs.existsSync(pagesDir)) return false;

  const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    try {
      let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const idx = data.findIndex(c => c.id === captureId);
      if (idx !== -1) {
        data.splice(idx, 1);
        if (data.length === 0) {
          fs.unlinkSync(filePath);
        } else {
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
        updateMetaOnDelete(sessionDir, captureId);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

function updateMetaOnDelete(sessionDir, capture) {
  const metaFile = path.join(sessionDir, 'meta.json');
  if (!fs.existsSync(metaFile)) return;

  try {
    let meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    meta.captureCount = Math.max(0, (meta.captureCount || 1) - 1);
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  } catch (e) {}
}

module.exports = {
  saveCapture,
  deleteSession,
  deleteCapture,
  getSessionData,
  getSessions,
  exportSessionJSON
};
