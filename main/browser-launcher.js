const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

function debugLog(msg) {
  const logFile = path.join(__dirname, '..', 'debug.log');
  const line = `[${new Date().toISOString()}] [Launcher] ${msg}\n`;
  try { fs.appendFileSync(logFile, line, 'utf-8'); } catch (e) {}
  console.log('[Launcher] ' + msg);
}

function isChromeRunning() {
  try {
    if (process.platform === 'win32') {
      const result = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', { encoding: 'utf8', timeout: 3000 });
      return result.includes('chrome.exe');
    }
    if (process.platform === 'darwin') {
      const result = execSync('pgrep -x "Google Chrome" || true', { encoding: 'utf8', timeout: 3000 });
      return result.trim().length > 0;
    }
  } catch (e) {
    debugLog('Error checking Chrome: ' + e.message);
  }
  return false;
}

function closeExistingChrome() {
  debugLog('Closing existing Chrome processes...');
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM chrome.exe', { timeout: 5000 });
      // execSync('taskkill /F /IM edge.exe', { timeout: 5000 });
      debugLog('Existing Chrome closed');
      return true;
    }
    if (process.platform === 'darwin') {
      execSync('killall "Google Chrome" || true', { timeout: 5000 });
      debugLog('Existing Chrome closed');
      return true;
    }
  } catch (e) {
    debugLog('Error closing Chrome: ' + e.message);
  }
  return false;
}

async function launchBrowser() {
  const extPath = path.resolve(__dirname, '..', 'extension');

  debugLog('Extension path: ' + extPath);
  debugLog('Extension exists: ' + fs.existsSync(extPath));

  if (!fs.existsSync(extPath)) {
    throw new Error('Extension directory not found at ' + extPath);
  }

  let puppeteerBase;
  try {
    puppeteerBase = await import('puppeteer');
  } catch (e) {
    throw new Error('Failed to load puppeteer: ' + e.message);
  }

  const puppeteer = addExtra(puppeteerBase);
  puppeteer.use(StealthPlugin());
  const chromePath = await puppeteer.executablePath();

  const profileDir = path.join(os.tmpdir(), 'researcher-chrome-profile');
  try {
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    fs.mkdirSync(profileDir, { recursive: true });
  } catch (err) {
    throw new Error('Failed to prepare profile directory: ' + err.message);
  }

  const args = [
    `--load-extension=${extPath}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    '--disable-blink-features=AutomationControlled',
    'https://www.google.com/'
  ];

  debugLog('Launching Chrome via Puppeteer (stealth, system Chrome)...');

  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      devtools: false,
      args: args,
      enableExtensions: true,
      ignoreDefaultArgs: ['--enable-automation']
    });

    const pid = browser.process().pid;
    const launchedPath = browser.process().spawnfile || 'Google Chrome (system)';
    debugLog('Chrome launched via Puppeteer, PID: ' + pid + ', path: ' + launchedPath);
    return { path: launchedPath, pid };
  } catch (err) {
    throw new Error('Puppeteer launch failed: ' + err.message);
  }
}

module.exports = { launchBrowser, closeExistingChrome, isChromeRunning };
