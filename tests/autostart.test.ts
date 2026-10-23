import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../tv/autostart.sh', import.meta.url));

// Feeds power-state messages to the watcher's decision logic; one "launch" or "-" per message.
const decide = (lines: string[]) => {
  const run = spawnSync('sh', [script, 'watch-test'], {
    input: `${lines.join('\n')}\n`,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim().split('\n').filter(Boolean);
};

const initial = '{ "state": "Active", "subscribed": true, "returnValue": true }';

test('autostart.sh parses as POSIX shell', () => {
  assert.equal(spawnSync('sh', ['-n', script]).status, 0);
});

test('the first power-state message only records the current state', () => {
  assert.deepEqual(decide([initial]), ['-']);
  assert.deepEqual(decide(['{"state":"Suspend"}', '{"state":"Active"}']), ['-', 'launch']);
});

test('coming back from standby launches LumiOS exactly once', () => {
  assert.deepEqual(
    decide([
      initial,
      '{"state":"Active","processing":"Prepare Suspend","returnValue":true}',
      '{"state":"Suspend","returnValue":true}',
      '{"state":"Active","processing":"Prepare Resume","returnValue":true}',
      '{"state":"Active","returnValue":true}',
      '{"state":"Active","processing":"Screen On"}',
    ]),
    ['-', '-', '-', 'launch', '-', '-'],
  );
});

test('a resume without processing steps and a power-on step both count', () => {
  assert.deepEqual(decide([initial, '{"state":"Suspend"}', '{"state":"Active"}']), [
    '-',
    '-',
    'launch',
  ]);
  assert.deepEqual(decide([initial, '{"state":"Active","processing":"Prepare Power On"}']), [
    '-',
    'launch',
  ]);
});

test('messages without a state are ignored and screen-off returns launch too', () => {
  assert.deepEqual(
    decide([
      initial,
      'garbage',
      '{"returnValue":false,"errorText":"busy"}',
      '{"state":"Active Standby","processing":"Screen Off"}',
      '{"state":"Active","processing":"Screen On"}',
    ]),
    ['-', '-', 'launch'],
  );
});
