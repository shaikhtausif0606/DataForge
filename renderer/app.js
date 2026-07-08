const State = {
  idle: 'idle',
  researching: 'researching',
  reviewing: 'reviewing'
};

let currentState = State.idle;
let currentSessionId = null;
let captures = [];
let selectedCaptureId = null;
let pendingDeleteId = null;
let pendingDeleteType = null;

const screens = {
  welcome: document.getElementById('welcomeScreen'),
  research: document.getElementById('researchScreen'),
  review: document.getElementById('reviewScreen'),
  ai: document.getElementById('aiScreen')
};

const startBtn = document.getElementById('startResearchBtn');
const endBtn = document.getElementById('endResearchBtn');
const newResearchBtn = document.getElementById('newResearchBtn');
const exportBtn = document.getElementById('exportJsonBtn');
const sessionInfo = document.getElementById('sessionInfo');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');
const captureCount = document.getElementById('captureCount');
const pageCount = document.getElementById('pageCount');
const capturesList = document.getElementById('capturesList');
const captureDetail = document.getElementById('captureDetail');
const totalCaptures = document.getElementById('totalCaptures');
const reviewCapturesList = document.getElementById('reviewCapturesList');
const reviewCaptureDetail = document.getElementById('reviewCaptureDetail');
const reviewTotalCaptures = document.getElementById('reviewTotalCaptures');
const reviewSessionId = document.getElementById('reviewSessionId');
const sessionList = document.getElementById('sessionList');
const aiMessages = document.getElementById('aiMessages');
const aiInput = document.getElementById('aiInput');
const aiSendBtn = document.getElementById('aiSendBtn');
const aiSessionSelect = document.getElementById('aiSessionSelect');

let aiConversations = {};
let currentAiSessionId = null;

function showScreen(name) {
  Object.keys(screens).forEach(key => {
    screens[key].style.display = 'none';
  });
  screens[name].style.display = 'flex';
}

function generateSessionId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `RS-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function getTypeLabel(type) {
  const labels = {
    element: 'Element',
    selection: 'Text',
    table: 'Table',
    fullpage: 'Full Page',
    manual: 'Manual Entry'
  };
  return labels[type] || type;
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function renderCaptureItem(capture, isActive, mode) {
  const domain = getDomain(capture.url);

  const div = document.createElement('div');
  div.className = `capture-item${isActive ? ' active' : ''}`;
  div.dataset.id = capture.id;

  div.innerHTML = `
    <div class="capture-item-header">
      <span class="capture-item-title">${capture.pageTitle || 'Untitled'}</span>
      <button class="capture-item-delete" title="Delete capture">×</button>
    </div>
    <div class="capture-item-meta">
      <span class="capture-item-type ${capture.type}">${getTypeLabel(capture.type)}</span>
      <span class="capture-item-url">${domain}</span>
      <span>${formatTimestamp(capture.timestamp)}</span>
    </div>
  `;

  div.querySelector('.capture-item-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDeleteCapture(capture.id, mode);
  });

  div.addEventListener('click', () => selectCapture(capture.id));

  return div;
}

function getCaptureDisplayText(capture) {
  const content = capture.data;

  switch (capture.type) {
    case 'element':
      return content.text || content.html || '(no content)';
    case 'selection':
      return content.text || '(no text selected)';
    case 'table':
      return content.tableRows
        ? content.tableRows.map(row => row.join('\t')).join('\n')
        : '(no table data)';
    case 'fullpage':
      return content.text || '(no content)';
    case 'manual':
      return content.text || '(empty note)';
    default:
      return JSON.stringify(content, null, 2);
  }
}

function extractCaptureImageSrc(capture) {
  if (capture.type !== 'element') return null;
  const html = capture.data && capture.data.html;
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const img = doc.querySelector('img');
    const src = img && img.getAttribute('src');
    if (!src) return null;
    return new URL(src, capture.url).href;
  } catch {
    return null;
  }
}

function buildCaptureContentBoxHtml(capture) {
  const imageSrc = extractCaptureImageSrc(capture);
  if (imageSrc) {
    const preview = `<div class="capture-image-preview"><img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(capture.pageTitle || 'Captured image')}" onerror="this.closest('.capture-image-preview').classList.add('broken')" /></div>`;
    const text = (capture.data.text || '').trim();
    return text ? preview + `<pre>${escapeHtml(text)}</pre>` : preview;
  }
  return `<pre>${escapeHtml(getCaptureDisplayText(capture))}</pre>`;
}

function renderCaptureDetail(capture) {
  captureDetail.innerHTML = `
    <div class="detail-card">
      <div class="detail-card-header">
        <h3>${capture.pageTitle || 'Untitled'}</h3>
        <div class="detail-card-url">${capture.url}</div>
      </div>
      <div class="detail-card-body">
        <div class="detail-meta">
          <div class="detail-meta-item">
            <span class="label">Type</span>
            <span class="value">${getTypeLabel(capture.type)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="label">Captured</span>
            <span class="value">${formatTimestamp(capture.timestamp)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="label">Page</span>
            <span class="value">${getDomain(capture.url)}</span>
          </div>
        </div>
        <div class="detail-content-box">
          ${buildCaptureContentBoxHtml(capture)}
        </div>
      </div>
      <div class="detail-card-footer">
        <button class="btn btn-secondary" onclick="confirmDeleteCapture('${capture.id}', 'research')">
          Remove
        </button>
      </div>
    </div>
  `;
}

function renderReviewCaptureDetail(capture) {
  reviewCaptureDetail.innerHTML = `
    <div class="detail-card">
      <div class="detail-card-header">
        <h3>${capture.pageTitle || 'Untitled'}</h3>
        <div class="detail-card-url">${capture.url}</div>
      </div>
      <div class="detail-card-body">
        <div class="detail-meta">
          <div class="detail-meta-item">
            <span class="label">Type</span>
            <span class="value">${getTypeLabel(capture.type)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="label">Captured</span>
            <span class="value">${formatTimestamp(capture.timestamp)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="label">Page</span>
            <span class="value">${getDomain(capture.url)}</span>
          </div>
        </div>
        <div class="detail-content-box">
          ${buildCaptureContentBoxHtml(capture)}
        </div>
      </div>
      <div class="detail-card-footer">
        <button class="btn btn-danger" onclick="confirmDeleteCapture('${capture.id}', 'review')">
          Remove
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function selectCapture(id) {
  selectedCaptureId = id;
  const capture = captures.find(c => c.id === id);
  if (!capture) return;

  const items = capturesList.querySelectorAll('.capture-item');
  items.forEach(item => item.classList.toggle('active', item.dataset.id === id));

  renderCaptureDetail(capture);
}

function removeCapture(id) {
  captures = captures.filter(c => c.id !== id);
  selectedCaptureId = null;
  if (window.api && window.api.deleteCapture && currentSessionId) {
    window.api.deleteCapture(currentSessionId, id).catch(() => {});
  }
  renderCapturesList();
  captureDetail.innerHTML = `
    <div class="detail-placeholder">
      <span class="placeholder-icon">📋</span>
      <p>Select a captured item to view its details</p>
    </div>
  `;
  updateStats();
}

function confirmDeleteCapture(id) {
  pendingDeleteId = id;
  pendingDeleteType = 'capture';
  document.getElementById('confirmText').textContent = 'Are you sure you want to delete this capture?';
  document.getElementById('confirmOverlay').classList.add('active');
}

function confirmDeleteSession(id) {
  pendingDeleteId = id;
  pendingDeleteType = 'session';
  document.getElementById('confirmText').textContent = 'Delete this entire session and all its captures?';
  document.getElementById('confirmOverlay').classList.add('active');
}

function renderCapturesList() {
  capturesList.innerHTML = '';
  totalCaptures.textContent = captures.length;

  if (captures.length === 0) {
    capturesList.innerHTML = '<div class="empty-captures">No captures yet. Browse the web and capture data using the extension.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  captures.forEach(c => {
    fragment.appendChild(renderCaptureItem(c, c.id === selectedCaptureId, 'research'));
  });
  capturesList.appendChild(fragment);
}

function renderReviewCapturesList() {
  reviewCapturesList.innerHTML = '';
  reviewTotalCaptures.textContent = captures.length;

  if (captures.length === 0) {
    reviewCapturesList.innerHTML = '<div class="empty-captures">No captures in this session.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  captures.forEach(c => {
    const item = renderCaptureItem(c, c.id === selectedCaptureId, 'review');
    item.addEventListener('click', () => {
      selectedCaptureId = c.id;
      document.querySelectorAll('#reviewCapturesList .capture-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === c.id);
      });
      renderReviewCaptureDetail(c);
    });
    fragment.appendChild(item);
  });
  reviewCapturesList.appendChild(fragment);
}

async function removeCaptureFromStorage(id) {
  captures = captures.filter(c => c.id !== id);
  selectedCaptureId = null;
  if (window.api && window.api.deleteCapture) {
    await window.api.deleteCapture(reviewSessionId.textContent, id);
  }
  renderReviewCapturesList();
  reviewCaptureDetail.innerHTML = `
    <div class="detail-placeholder">
      <span class="placeholder-icon">📋</span>
      <p>Select a captured item to view its details</p>
    </div>
  `;
}

function updateStats() {
  captureCount.textContent = captures.length;
  const uniqueUrls = new Set(captures.map(c => c.url));
  pageCount.textContent = uniqueUrls.size;
}

function renderSessionList(sessions) {
  sessionList.innerHTML = '';

  if (!sessions || sessions.length === 0) {
    sessionList.innerHTML = '<div class="no-sessions">No past sessions yet</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  sessions.forEach(s => {
    const div = document.createElement('div');
    div.className = 'session-list-item';
    div.innerHTML = `
      <span class="session-list-icon">📋</span>
      <span class="session-list-name">${s.id}</span>
      <span class="session-date">${s.captureCount || 0} items</span>
      <button class="session-list-delete" title="Delete session">×</button>
    `;
    div.querySelector('.session-list-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteSession(s.id);
    });
    div.addEventListener('click', () => loadSession(s.id));
    fragment.appendChild(div);
  });
  sessionList.appendChild(fragment);
}

async function loadSession(sessionId) {
  try {
    if (window.api && window.api.getSessionData) {
      const data = await window.api.getSessionData(sessionId);
      captures = data || [];
    }
    selectedCaptureId = null;
    renderReviewCapturesList();
    reviewCaptureDetail.innerHTML = `
      <div class="detail-placeholder">
        <span class="placeholder-icon">📋</span>
        <p>Select a captured item to view its details</p>
      </div>
    `;
    reviewSessionId.textContent = sessionId;
    showScreen('review');
    currentState = State.reviewing;
    populateSessionSelectors();
    document.getElementById('reviewAiSession').value = sessionId;
    loadReviewAiSession(sessionId);
  } catch (err) {
    console.error('Failed to load session:', err);
  }
}

/* ─── Event Handlers ─── */

startBtn.addEventListener('click', async () => {
  currentSessionId = generateSessionId();
  captures = [];
  selectedCaptureId = null;

  sessionIdDisplay.textContent = currentSessionId;
  updateStats();
  renderCapturesList();
  captureDetail.innerHTML = `
    <div class="detail-placeholder">
      <span class="placeholder-icon">📋</span>
      <p>Select a captured item to view its details</p>
    </div>
  `;

  startBtn.style.display = 'none';
  endBtn.style.display = 'flex';
  sessionInfo.style.display = 'block';
  showScreen('research');
  currentState = State.researching;

  const logEl = document.querySelector('.research-tips p');
  if (logEl) logEl.textContent = '⏳ Preparing Chrome (existing Chrome windows will close)...';

  try {
    if (window.api && window.api.startResearch) {
      const sessionId = await window.api.startResearch();
      if (sessionId === null) {
        startBtn.style.display = 'flex';
        endBtn.style.display = 'none';
        sessionInfo.style.display = 'none';
        showScreen('welcome');
        currentState = State.idle;
        return;
      }
      if (sessionId) currentSessionId = sessionId;
      sessionIdDisplay.textContent = currentSessionId;
      if (logEl) logEl.textContent = '✅ Chrome restarted with Research Capturer extension. Click the puzzle icon (🧩) in Chrome toolbar to find and pin the extension.';
    } else {
      if (logEl) logEl.textContent = '⚠️ API not available (running outside Electron?)';
    }
  } catch (err) {
    console.error('Failed to start research:', err);
    if (logEl) logEl.textContent = '❌ ' + err.message;
  }
});

endBtn.addEventListener('click', async () => {
  endBtn.style.display = 'none';
  sessionInfo.style.display = 'none';
  startBtn.style.display = 'flex';

  reviewSessionId.textContent = currentSessionId;
  renderReviewCapturesList();
  reviewCaptureDetail.innerHTML = `
    <div class="detail-placeholder">
      <span class="placeholder-icon">📋</span>
      <p>Select a captured item to view its details</p>
    </div>
  `;
  showScreen('review');
  currentState = State.reviewing;

  try {
    if (window.api && window.api.endResearch) {
      await window.api.endResearch();
    }
  } catch (err) {
    console.error('Failed to end research:', err);
  }

  try {
    if (window.api && window.api.getSessions) {
      const sessions = await window.api.getSessions();
      renderSessionList(sessions);
    }
    populateSessionSelectors();
    document.getElementById('reviewAiSession').value = currentSessionId;
    loadReviewAiSession(currentSessionId);
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
});

newResearchBtn.addEventListener('click', () => {
  captures = [];
  selectedCaptureId = null;
  currentSessionId = null;
  startBtn.style.display = 'flex';
  endBtn.style.display = 'none';
  sessionInfo.style.display = 'none';
  showScreen('welcome');
  currentState = State.idle;
});

exportBtn.addEventListener('click', async () => {
  try {
    if (window.api && window.api.exportJSON) {
      await window.api.exportJSON(currentSessionId);
    }
  } catch (err) {
    console.error('Failed to export:', err);
  }
});

/* ─── Navigation ─── */

document.getElementById('aiAssistantNavBtn').addEventListener('click', () => {
  showScreen('ai');
  populateSessionSelectors();
});

/* ─── Settings ─── */

async function openSettings() {
  try {
    if (window.api) {
      const key = await window.api.getApiKey();
      const model = await window.api.settingsGet('model') || '';
      const provider = await window.api.settingsGet('provider') || 'openrouter';
      document.getElementById('settingsApiKey').value = key || '';
      document.getElementById('settingsModel').value = model || '';
      document.getElementById('settingsProvider').value = provider;
      await populateModelDropdown(key, provider, model);
    }
    document.getElementById('settingsOverlay').classList.add('active');
  } catch (err) {
    console.error('[Settings] Error:', err);
  }
}

async function populateModelDropdown(apiKey, provider, selectedModel) {
  const select = document.getElementById('settingsModel');
  if (!apiKey) {
    select.innerHTML = '<option value="">Enter API key and fetch models</option>';
    return;
  }
  select.innerHTML = '<option value="">Loading models...</option>';
  try {
    let models;
    if (window.api) {
      models = await window.api.fetchModels(apiKey, provider);
    } else {
      models = [];
    }
    select.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id + (m.name && m.name !== m.id ? ' — ' + m.name : '');
      select.appendChild(opt);
    });
    if (selectedModel && [...select.options].some(o => o.value === selectedModel)) {
      select.value = selectedModel;
    }
  } catch (err) {
    select.innerHTML = '<option value="">Failed to load: ' + err.message + '</option>';
  }
}

document.getElementById('settingsBtn').addEventListener('click', openSettings);

document.getElementById('settingsCloseBtn').addEventListener('click', () => {
  document.getElementById('settingsOverlay').classList.remove('active');
});

document.getElementById('fetchModelsBtn').addEventListener('click', async () => {
  const key = document.getElementById('settingsApiKey').value.trim();
  const provider = document.getElementById('settingsProvider').value;
  await populateModelDropdown(key, provider, document.getElementById('settingsModel').value);
});

document.getElementById('settingsProvider').addEventListener('change', () => {
  const key = document.getElementById('settingsApiKey').value.trim();
  const provider = document.getElementById('settingsProvider').value;
  populateModelDropdown(key, provider, '');
});

document.getElementById('settingsApiKey').addEventListener('input', () => {
  if (!document.getElementById('settingsApiKey').value.trim()) {
    document.getElementById('settingsModel').innerHTML = '<option value="">Enter API key and fetch models</option>';
  }
});

document.getElementById('settingsSaveBtn').addEventListener('click', async () => {
  const key = document.getElementById('settingsApiKey').value.trim();
  const model = document.getElementById('settingsModel').value;
  const provider = document.getElementById('settingsProvider').value;
  if (window.api) {
    await window.api.setApiKey(key);
    await window.api.settingsSet('model', model);
    await window.api.settingsSet('provider', provider);
  }
  const status = document.getElementById('settingsStatus');
  status.textContent = '✓ Settings saved';
  setTimeout(() => { status.textContent = ''; }, 3000);
});

/* ─── AI Assistant ─── */

function scrollAiToBottom() {
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function persistConversation(sessionId) {
  const msgs = aiConversations[sessionId];
  if (msgs && window.api && window.api.chatSave) {
    window.api.chatSave(sessionId, msgs).catch(() => {});
  }
}

function addAiMessage(sessionId, role, content) {
  if (!aiConversations[sessionId]) {
    aiConversations[sessionId] = [];
  }
  aiConversations[sessionId].push({ role, content });
  persistConversation(sessionId);

  const reviewAiSession = document.getElementById('reviewAiSession');
  if (reviewAiSession && reviewAiSession.value === sessionId) {
    appendReviewAiMessage(role, content);
  }

  if (sessionId !== currentAiSessionId) return;

  const empty = aiMessages.querySelector('.ai-empty-msg');
  if (empty) empty.remove();

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${role}`;

  const div = document.createElement('div');
  div.className = `message ${role}`;

  if (role === 'assistant') {
    div.innerHTML = content.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  } else {
    div.textContent = content;
  }

  wrapper.appendChild(div);

  if (role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-copy-btn';
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy response';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content);
      copyBtn.textContent = '✅';
      setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
    });
    wrapper.appendChild(copyBtn);
  }

  aiMessages.appendChild(wrapper);
  scrollAiToBottom();
}

function loadAiSession(sessionId) {
  currentAiSessionId = sessionId;
  aiMessages.innerHTML = '';

  if (!aiConversations[sessionId] && window.api && window.api.chatLoad) {
    window.api.chatLoad(sessionId).then(saved => {
      aiConversations[sessionId] = saved || [];
      renderAiMessages(sessionId);
    }).catch(() => {
      aiConversations[sessionId] = [];
      renderAiMessages(sessionId);
    });
  } else {
    renderAiMessages(sessionId);
  }
}

function renderAiMessages(sessionId) {
  aiMessages.innerHTML = '';
  const msgs = aiConversations[sessionId] || [];
  if (msgs.length === 0) {
    aiMessages.innerHTML = `
      <div class="ai-empty-msg">
        <div class="ai-welcome-icon">🤖</div>
        <h3>AI Research Assistant</h3>
        <p>Ask me to analyze your research data, generate content, or create structured outputs.</p>
      </div>`;
    return;
  }
  msgs.forEach(m => {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${m.role}`;
    const div = document.createElement('div');
    div.className = `message ${m.role}`;
    if (m.role === 'assistant') {
      div.innerHTML = m.content.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    } else {
      div.textContent = m.content;
    }
    wrapper.appendChild(div);
    if (m.role === 'assistant') {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'msg-copy-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = 'Copy response';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(m.content);
        copyBtn.textContent = '✅';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
      });
      wrapper.appendChild(copyBtn);
    }
    aiMessages.appendChild(wrapper);
  });
  scrollAiToBottom();
}

async function sendAiMessage(text) {
  const sessionId = aiSessionSelect.value;
  if (!sessionId) {
    addAiMessage(currentAiSessionId || '_', 'assistant', 'Please select a research session first.');
    return;
  }
  if (!text.trim()) return;

  addAiMessage(sessionId, 'user', text);
  aiInput.value = '';

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message assistant';
  loadingDiv.textContent = '⏳ Thinking...';
  aiMessages.appendChild(loadingDiv);
  scrollAiToBottom();

  const conv = aiConversations[sessionId] || [];
  try {
    let result;
    if (window.api) {
      result = await window.api.aiChat(sessionId, conv);
    } else {
      result = 'AI API not available (running outside Electron?)';
    }
    loadingDiv.remove();
    addAiMessage(sessionId, 'assistant', result);
  } catch (err) {
    loadingDiv.remove();
    addAiMessage(sessionId, 'assistant', 'Error: ' + err.message);
  }
}

aiSendBtn.addEventListener('click', () => sendAiMessage(aiInput.value));
aiInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendAiMessage(aiInput.value);
});

aiSessionSelect.addEventListener('change', () => {
  const prevId = currentAiSessionId;
  const sessionId = aiSessionSelect.value;
  if (prevId && prevId !== sessionId) {
    persistConversation(prevId);
  }
  if (sessionId) {
    loadAiSession(sessionId);
  }
});

function getQuickActionPrompt(action) {
  const prompts = {
    summarize: 'Provide a concise summary of all the captured research data. Organize by key themes and findings.',
    article: 'Write a well-structured article based on the research data. Include an introduction, key findings, and conclusion.',
    presentation: 'Create a slide-by-slide presentation outline based on this research. For each slide, provide a title and bullet points.',
    excel: 'Extract all structured data from the captures and format it as a CSV-ready table. Use clear column headers.',
    blog: 'Write an engaging blog post based on the research findings. Use a conversational tone suitable for a general audience.',
    report: 'Create a formal research report with: executive summary, methodology, findings, analysis, and recommendations.'
  };
  return prompts[action] || '';
}

document.querySelectorAll('.ai-quick-actions .btn-sm').forEach(btn => {
  btn.addEventListener('click', () => {
    const prompt = getQuickActionPrompt(btn.dataset.action);
    if (prompt) sendAiMessage(prompt);
  });
});

function populateSessionSelectors() {
  if (!window.api) return;
  window.api.getSessions().then(sessions => {
    const selects = [aiSessionSelect, document.getElementById('reviewAiSession')];
    selects.forEach(select => {
      const current = select.value;
      select.innerHTML = '<option value="">— Select a session —</option>';
      sessions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id} (${s.captureCount || 0} items)`;
        select.appendChild(opt);
      });
      if (current && [...select.options].some(o => o.value === current)) {
        select.value = current;
      }
    });
  }).catch(() => {});
}

/* ─── Review AI Panel ─── */

function appendReviewAiMessage(role, content) {
  const container = document.getElementById('reviewAiMessages');
  const empty = container.querySelector('.ai-empty-msg');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
    container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderReviewAiMessages(sessionId) {
  const container = document.getElementById('reviewAiMessages');
  const msgs = aiConversations[sessionId] || [];
  if (msgs.length === 0) {
    container.innerHTML = '<div class="ai-empty-msg">Ask AI to analyze, summarize, or generate content from this session\'s data.</div>';
    return;
  }
  container.innerHTML = '';
  msgs.forEach(m => appendReviewAiMessage(m.role, m.content));
}

function loadReviewAiSession(sessionId) {
  if (!sessionId) {
    document.getElementById('reviewAiMessages').innerHTML = '<div class="ai-empty-msg">Ask AI to analyze, summarize, or generate content from this session\'s data.</div>';
    return;
  }
  if (!aiConversations[sessionId] && window.api && window.api.chatLoad) {
    window.api.chatLoad(sessionId).then(saved => {
      aiConversations[sessionId] = saved || [];
      renderReviewAiMessages(sessionId);
    }).catch(() => {
      aiConversations[sessionId] = [];
      renderReviewAiMessages(sessionId);
    });
  } else {
    renderReviewAiMessages(sessionId);
  }
}

document.getElementById('reviewAiToggle').addEventListener('click', () => {
  document.getElementById('reviewAiPanel').classList.toggle('collapsed');
  populateSessionSelectors();
  loadReviewAiSession(document.getElementById('reviewAiSession').value);
});

document.getElementById('reviewAiSession').addEventListener('change', () => {
  loadReviewAiSession(document.getElementById('reviewAiSession').value);
});

document.getElementById('reviewAiSendBtn').addEventListener('click', async () => {
  const input = document.getElementById('reviewAiInput');
  const text = input.value.trim();
  if (!text) return;

  const sessionId = document.getElementById('reviewAiSession').value;
  if (!sessionId) {
    appendReviewAiMessage('assistant', 'Please select a session first.');
    return;
  }
  input.value = '';

  addAiMessage(sessionId, 'user', text);

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message assistant';
  loadingDiv.textContent = '⏳ Thinking...';
  const container = document.getElementById('reviewAiMessages');
  container.appendChild(loadingDiv);
  container.scrollTop = container.scrollHeight;

  const conv = aiConversations[sessionId] || [];
  try {
    let result;
    if (window.api) {
      result = await window.api.aiChat(sessionId, conv);
    } else {
      result = 'AI API not available.';
    }
    loadingDiv.remove();
    addAiMessage(sessionId, 'assistant', result);
  } catch (err) {
    loadingDiv.remove();
    addAiMessage(sessionId, 'assistant', 'Error: ' + err.message);
  }
});

document.getElementById('reviewAiInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('reviewAiSendBtn').click();
});

document.querySelectorAll('.review-ai-quick-actions .btn-sm').forEach(btn => {
  btn.addEventListener('click', () => {
    const prompt = getQuickActionPrompt(btn.dataset.action);
    if (prompt) {
      document.getElementById('reviewAiInput').value = prompt;
      document.getElementById('reviewAiSendBtn').click();
    }
  });
});

/* ─── Window Controls ─── */

document.getElementById('minimizeBtn').addEventListener('click', () => {
  if (window.api) window.api.minimizeWindow();
});

document.getElementById('maximizeBtn').addEventListener('click', () => {
  if (window.api) window.api.maximizeWindow();
});

document.getElementById('closeBtn').addEventListener('click', () => {
  if (window.api) window.api.closeWindow();
});

/* ─── Add Capture Manually ─── */

let addCaptureMode = 'research';

function openAddCaptureModal(mode) {
  addCaptureMode = mode;
  document.getElementById('addCaptureTitle').value = '';
  document.getElementById('addCaptureUrl').value = '';
  document.getElementById('addCaptureText').value = '';
  document.getElementById('addCaptureStatus').textContent = '';
  document.getElementById('addCaptureOverlay').classList.add('active');
}

function closeAddCaptureModal() {
  document.getElementById('addCaptureOverlay').classList.remove('active');
}

document.getElementById('addManualBtnResearch').addEventListener('click', () => {
  if (!currentSessionId) {
    alert('Start a research session first.');
    return;
  }
  openAddCaptureModal('research');
});

document.getElementById('addManualBtnReview').addEventListener('click', () => {
  if (!reviewSessionId.textContent) {
    alert('Open a session first.');
    return;
  }
  openAddCaptureModal('review');
});

document.getElementById('addCaptureCloseBtn').addEventListener('click', closeAddCaptureModal);

document.getElementById('addCaptureSaveBtn').addEventListener('click', async () => {
  const status = document.getElementById('addCaptureStatus');
  const pageTitle = document.getElementById('addCaptureTitle').value.trim();
  const url = document.getElementById('addCaptureUrl').value.trim();
  const text = document.getElementById('addCaptureText').value.trim();

  if (!text) {
    status.textContent = 'Content is required';
    return;
  }

  const sessionId = addCaptureMode === 'review' ? reviewSessionId.textContent : currentSessionId;
  if (!sessionId || !window.api || !window.api.addCapture) {
    status.textContent = 'No active session';
    return;
  }

  try {
    const capture = await window.api.addCapture(sessionId, { pageTitle, url, text });
    captures.push(capture);
    if (addCaptureMode === 'review') {
      renderReviewCapturesList();
    } else {
      renderCapturesList();
      updateStats();
    }
    closeAddCaptureModal();
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
});

/* ─── Confirm Delete Modal ─── */

document.getElementById('confirmYesBtn').addEventListener('click', async () => {
  document.getElementById('confirmOverlay').classList.remove('active');
  const id = pendingDeleteId;
  const type = pendingDeleteType;
  pendingDeleteId = null;
  pendingDeleteType = null;
  if (!id) return;

  if (type === 'session') {
    if (window.api && window.api.deleteSession) {
      await window.api.deleteSession(id);
    }
    if (window.api && window.api.getSessions) {
      const sessions = await window.api.getSessions();
      renderSessionList(sessions);
    }
    if (currentState === State.reviewing && reviewSessionId.textContent === id) {
      showScreen('welcome');
      currentState = State.idle;
    }
  } else if (currentState === State.reviewing) {
    removeCaptureFromStorage(id);
  } else {
    removeCapture(id);
  }
});

document.getElementById('confirmNoBtn').addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.remove('active');
  pendingDeleteId = null;
  pendingDeleteType = null;
});

if (window.api) {
  window.api.onMaximizeChange((isMaximized) => {
    const btn = document.getElementById('maximizeBtn');
    btn.textContent = isMaximized ? '❐' : '□';
    btn.title = isMaximized ? 'Restore' : 'Maximize';
  });
}

/* ─── IPC Listeners ─── */

if (window.api) {
  window.api.onCaptureUpdate((capture) => {
    const exists = captures.some(c => c.id === capture.id);
    if (!exists) {
      captures.push(capture);
      renderCapturesList();
      updateStats();
    }
  });

  window.api.onSessionStatus((status) => {
    console.log('Session status:', status);
  });

  window.api.onExtensionConnected((connected) => {
    const logEl = document.querySelector('.research-tips p');
    if (logEl) {
      logEl.textContent = connected
        ? '✅ Extension connected! Use the browser extension to capture data from any webpage.'
        : '⏳ Waiting for extension connection... Click the extension icon in Chrome to start capturing.';
    }
    const statusDot = document.querySelector('.status-dot');
    if (statusDot) {
      statusDot.className = 'status-dot' + (connected ? ' active' : '');
    }
  });

  window.api.onExtensionError((msg) => {
    const logEl = document.querySelector('.research-tips p');
    if (logEl) logEl.textContent = '⚠️ Extension error: ' + msg;
  });

  window.api.onResearchLog((msg) => {
    console.log('[Research]', msg);
  });

  window.api.getSessions().then(sessions => {
    renderSessionList(sessions);
  }).catch(() => {});
}

window.addEventListener('beforeunload', () => {
  Object.keys(aiConversations).forEach(sid => persistConversation(sid));
});

/* ─── Init ─── */

showScreen('welcome');
