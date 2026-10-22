#!/usr/bin/env node
// LumiOS system preload. Registers the launcher with LG's preload manager, the mechanism that
// keeps Netflix and YouTube warm, by taking LG Home's place in its app list (as AltHome does).
// Root only; runs with the TV's own Node.js. Prints one JSON line and always exits 0.
//
//   node preload.js status | enable | disable | apply
'use strict';
var fs = require('fs');
var cp = require('child_process');

var APP_ID = 'com.dezik.lumios';
var LG_HOME = 'com.webos.app.home';
var KEY = 'com.webos.service.preloadmanager.supportAppList';
var DIR = '/media/developer/lumios';
var BACKUP = DIR + '/preload-backup.json';
var DESIRED = DIR + '/preload.json';

function lunaFlag() {
  try {
    if (/ 1[01]\./.test(fs.readFileSync('/etc/starfish-release', 'utf8'))) return '-t';
  } catch {
    /* Older firmware without the release file. */
  }
  return '-n';
}

function luna(uri, payload) {
  var out = cp.execFileSync(
    '/usr/bin/luna-send',
    [lunaFlag(), '1', '-w', '5000', uri, JSON.stringify(payload)],
    { encoding: 'utf8', timeout: 8000 },
  );
  var lines = out.trim().split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function readList() {
  var reply = luna('luna://com.webos.service.config/getConfigs', { configNames: [KEY] });
  if (!reply.returnValue) throw new Error(reply.errorText || 'configd getConfigs failed.');
  var list = reply.configs && reply.configs[KEY];
  if (!Array.isArray(list)) throw new Error('This TV has no preload manager app list.');
  return list;
}

function writeList(list) {
  var configs = {};
  configs[KEY] = list;
  var reply = luna('luna://com.webos.service.config/setConfigs', { configs: configs });
  if (!reply.returnValue) throw new Error(reply.errorText || 'configd setConfigs failed.');
}

function restartManager() {
  try {
    cp.execFileSync('systemctl', ['restart', 'preload-manager.service'], {
      stdio: 'ignore',
      timeout: 15000,
    });
  } catch {
    /* Firmware without the unit: configd still applies the list on the next boot. */
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function isApp(id) {
  return function (entry) {
    return !!entry && entry.id === id;
  };
}

function status(list) {
  var current = list || readList();
  return {
    enabled: current.some(isApp(APP_ID)),
    entries: current.length,
    backup: fs.existsSync(BACKUP),
  };
}

function enable() {
  var list = readList();
  if (!fs.existsSync(BACKUP)) writeJson(BACKUP, list);
  var home = list.filter(isApp(LG_HOME))[0];
  var entry = Object.assign(
    { staticPriority: 1, requiredMemory: 0, preloadType: 'periodic', isPinUp: false },
    home || {},
    { id: APP_ID, preloadMode: 'partial', isEnabled: true },
  );
  var next = list
    .filter(function (item) {
      return !!item && item.id !== APP_ID && item.id !== LG_HOME;
    })
    .concat([entry]);
  writeJson(DESIRED, next);
  writeList(next);
  restartManager();
  return status(next);
}

function disable() {
  var restored = fs.existsSync(BACKUP)
    ? readJson(BACKUP)
    : readList().filter(function (item) {
        return !!item && item.id !== APP_ID;
      });
  writeList(restored);
  [BACKUP, DESIRED].forEach(function (file) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* Already gone. */
    }
  });
  restartManager();
  return status(restored);
}

// Boot hook: re-apply the saved list so the registration survives firmware housekeeping.
function apply() {
  if (!fs.existsSync(DESIRED)) return { applied: false };
  var desired = readJson(DESIRED);
  writeList(desired);
  restartManager();
  return Object.assign({ applied: true }, status(desired));
}

var commands = { status: status, enable: enable, disable: disable, apply: apply };
var command = commands[process.argv[2]];
try {
  if (!command) throw new Error('Usage: node preload.js status|enable|disable|apply');
  if (process.getuid && process.getuid() !== 0) throw new Error('Run as root.');
  console.log(JSON.stringify(command()));
} catch (error) {
  console.log(JSON.stringify({ error: error && error.message ? error.message : String(error) }));
}
