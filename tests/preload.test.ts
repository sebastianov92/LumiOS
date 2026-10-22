import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_DIRS, parsePreloadStatus, preloadCommand } from '../src/preload.ts';

test('the preload command runs the packaged script from whichever app folder exists', () => {
  const command = preloadCommand('enable');
  for (const dir of APP_DIRS) assert.ok(command.includes(`'${dir}'`));
  assert.ok(command.includes('exec /usr/bin/node "$d/preload.js" enable'));
  assert.ok(command.endsWith(`'{"error":"preload.js is not installed with this build."}'`));
});

test('preload status is read from the last JSON line and errors are surfaced', () => {
  assert.deepEqual(parsePreloadStatus('noise\n{"enabled":true,"entries":4,"backup":true}\n'), {
    enabled: true,
    entries: 4,
    backup: true,
  });
  assert.deepEqual(parsePreloadStatus('{"enabled":false}'), {
    enabled: false,
    entries: 0,
    backup: false,
  });
  assert.throws(() => parsePreloadStatus('{"error":"Run as root."}'), /Run as root/);
  assert.throws(() => parsePreloadStatus(''), /no preload status/);
  assert.throws(() => parsePreloadStatus('{nope'), /unreadable/);
});
