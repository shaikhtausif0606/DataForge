(function () {
  'use strict';

  let pickerMode = null;
  let overlay = null;
  let selectionBtn = null;
  let activeElement = null;

  function generateId() {
    return 'capt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getPageInfo() {
    return {
      url: window.location.href,
      pageTitle: document.title
    };
  }

  function sendCapture(data) {
    chrome.runtime.sendMessage({
      type: 'capture',
      payload: {
        id: generateId(),
        timestamp: new Date().toISOString(),
        ...getPageInfo(),
        ...data
      }
    });
  }

  /* ─── Element Picker ─── */

  function startElementPicker() {
    pickerMode = 'element';
    document.body.style.cursor = 'crosshair';
    overlay = document.createElement('div');
    overlay.id = '__research_overlay';
    overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,0.1);z-index:2147483647;transition:all 0.1s;display:none;';
    document.body.appendChild(overlay);

    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
  }

  function onHover(e) {
    if (e.target === overlay || e.target.id === '__research_btn') return;
    activeElement = e.target;
    const rect = activeElement.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  function onOut(e) {
    if (e.target === activeElement) {
      overlay.style.display = 'none';
      activeElement = null;
    }
  }

  function onClick(e) {
    if (e.target === overlay) return;
    e.preventDefault();
    e.stopPropagation();

    const el = activeElement || e.target;
    const text = el.textContent.trim();
    const html = el.outerHTML;
    const selector = getSelector(el);

    sendCapture({
      type: 'element',
      data: { text, html, selector }
    });

    stopPicker();
    showNotification('Element captured!');
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      stopPicker();
    }
  }

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift('#' + current.id);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          selector += ':nth-child(' + (Array.from(parent.children).indexOf(current) + 1) + ')';
        }
      }
      path.unshift(selector);
      current = parent;
    }
    return path.join(' > ');
  }

  /* ─── Text Selection ─── */

  function startSelectionMode() {
    pickerMode = 'selection';

    selectionBtn = document.createElement('div');
    selectionBtn.id = '__research_btn';
    selectionBtn.textContent = '📋 Capture Selection';
    selectionBtn.style.cssText = 'position:fixed;background:#6366f1;color:white;padding:8px 16px;border-radius:6px;font:14px sans-serif;cursor:pointer;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;';
    document.body.appendChild(selectionBtn);

    selectionBtn.addEventListener('click', () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      const range = sel.getRangeAt(0);

      sendCapture({
        type: 'selection',
        data: {
          text,
          startContext: range.startContainer.textContent.slice(0, 50),
          endContext: range.endContainer.textContent.slice(-50)
        }
      });

      sel.removeAllRanges();
      selectionBtn.style.display = 'none';
      showNotification('Selection captured!');
    });

    document.addEventListener('mouseup', onTextSelect);
    document.addEventListener('keydown', onKeyDown);
  }

  function onTextSelect(e) {
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        selectionBtn.style.display = 'block';
        selectionBtn.style.left = Math.max(0, rect.left + rect.width / 2 - 80) + 'px';
        selectionBtn.style.top = (rect.bottom + 8) + 'px';
      } else {
        selectionBtn.style.display = 'none';
      }
    }, 10);
  }

  /* ─── Table Capture ─── */

  function startTableMode() {
    pickerMode = 'table';
    const tables = document.querySelectorAll('table');

    if (tables.length === 0) {
      showNotification('No tables found on this page');
      stopPicker();
      return;
    }

    tables.forEach((table, index) => {
      const btn = document.createElement('div');
      btn.id = '__research_table_btn_' + index;
      btn.textContent = '📊 Capture Table';
      btn.style.cssText = 'position:absolute;background:#f59e0b;color:white;padding:4px 10px;border-radius:4px;font:12px sans-serif;cursor:pointer;z-index:2147483647;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

      const rect = table.getBoundingClientRect();
      btn.style.left = rect.left + 'px';
      btn.style.top = (rect.top - 28) + 'px';

      btn.dataset.tableIndex = index;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        captureTable(table);
      });

      document.body.appendChild(btn);
    });

    document.addEventListener('keydown', onKeyDown);
  }

  function captureTable(table) {
    const rows = [];
    const headerCells = table.querySelectorAll('thead tr:first-child th, thead tr:first-child td');

    if (headerCells.length > 0) {
      rows.push(Array.from(headerCells).map(c => c.textContent.trim()));
    }

    const bodyRows = table.querySelectorAll('tbody tr');
    if (bodyRows.length > 0) {
      bodyRows.forEach(row => {
        rows.push(Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim()));
      });
    } else {
      const allRows = table.querySelectorAll('tr');
      allRows.forEach((row, i) => {
        if (i === 0 && headerCells.length > 0) return;
        rows.push(Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim()));
      });
    }

    sendCapture({
      type: 'table',
      data: {
        tableRows: rows,
        rowCount: rows.length,
        colCount: rows[0]?.length || 0
      }
    });

    showNotification('Table captured!');
    stopPicker();
  }

  /* ─── Full Page Capture ─── */

  function startFullPageMode() {
    const text = document.body.innerText.trim();
    const html = document.documentElement.outerHTML;

    const meta = {};
    document.querySelectorAll('meta').forEach(m => {
      const name = m.getAttribute('name') || m.getAttribute('property');
      if (name) meta[name] = m.getAttribute('content') || '';
    });

    sendCapture({
      type: 'fullpage',
      data: {
        text: text.slice(0, 50000),
        html: html.slice(0, 100000),
        meta,
        textLength: text.length
      }
    });

    showNotification('Full page captured!');
  }

  /* ─── Utils ─── */

  function stopPicker() {
    pickerMode = null;
    document.body.style.cursor = '';

    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    if (selectionBtn) {
      selectionBtn.remove();
      selectionBtn = null;
    }

    const tableBtns = document.querySelectorAll('[id^="__research_table_btn_"]');
    tableBtns.forEach(b => b.remove());

    document.removeEventListener('mouseover', onHover, true);
    document.removeEventListener('mouseout', onOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mouseup', onTextSelect);
    document.removeEventListener('keydown', onKeyDown);
    activeElement = null;
  }

  function showNotification(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:20px;right:20px;background:#22c55e;color:white;padding:12px 20px;border-radius:8px;font:14px sans-serif;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.3);animation:fadeIn 0.3s;';
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 2000);
  }

  /* ─── Listen for messages from popup ─── */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'start_element_picker':
        stopPicker();
        startElementPicker();
        sendResponse({ ok: true });
        break;
      case 'start_selection_mode':
        stopPicker();
        startSelectionMode();
        sendResponse({ ok: true });
        break;
      case 'start_table_mode':
        stopPicker();
        startTableMode();
        sendResponse({ ok: true });
        break;
      case 'capture_fullpage':
        stopPicker();
        startFullPageMode();
        sendResponse({ ok: true });
        break;
      case 'stop_picker':
        stopPicker();
        sendResponse({ ok: true });
        break;
    }
    return true;
  });

  console.log('[Research Ext] Content script loaded');
})();
