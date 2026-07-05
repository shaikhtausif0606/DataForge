const fs = require('fs');
const path = require('path');

function getFilePath() {
  const userData = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'research-tool')
    : path.join(require('os').homedir(), '.research-tool');
  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true });
  }
  return path.join(userData, 'settings.json');
}

function load() {
  try {
    const file = getFilePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function save(settings) {
  try {
    fs.writeFileSync(getFilePath(), JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  const settings = load();
  settings[key] = value;
  return save(settings);
}

module.exports = { get, set, load, save };
