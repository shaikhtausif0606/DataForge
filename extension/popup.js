const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');

function updateStatus(connected) {
  if (connected) {
    statusBadge.className = 'status connected';
    statusBadge.textContent = 'Connected';
    statusText.textContent = 'Ready to capture data';
  } else {
    statusBadge.className = 'status disconnected';
    statusBadge.textContent = 'Disconnected';
    statusText.textContent = 'Make sure Research Tool is open';
  }
}

chrome.storage.local.get(['connected'], (result) => {
  updateStatus(!!result.connected);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.connected) {
    updateStatus(changes.connected.newValue);
  }
});

function sendAction(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action }, (response) => {
        if (chrome.runtime.lastError) {
          statusText.textContent = 'Error: refresh the page';
        }
      });
    }
  });
  window.close();
}

document.getElementById('captureElement').addEventListener('click', () => sendAction('start_element_picker'));
document.getElementById('captureSelection').addEventListener('click', () => sendAction('start_selection_mode'));
document.getElementById('captureTable').addEventListener('click', () => sendAction('start_table_mode'));
document.getElementById('captureFullPage').addEventListener('click', () => sendAction('capture_fullpage'));
