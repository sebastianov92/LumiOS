import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyInputNames,
  inputHeading,
  launcherInputs,
  newLauncherId,
  validLauncherId,
  visibleInputs,
} from '../src/inputs.ts';
import { inputKind, normalizeTargets } from '../src/catalog.ts';
import { parsePack, resolveInputIcon } from '../src/icnl.ts';
import { parsePreferences } from '../src/storage.ts';
import type { TVInput } from '../src/types.ts';

const hdmi = (id: string, title: string, connected: boolean | null): TVInput => ({
  id: `com.webos.app.${id}`,
  title,
  port: `HDMI ${id.slice(-1)}`,
  connected,
  kind: inputKind(title),
});

test('input names, icons and launchers survive storage only when valid', () => {
  const preferences = parsePreferences(
    JSON.stringify({
      version: 1,
      inputNames: { 'com.webos.app.hdmi1': '  Switch 2 ', 'com.webos.app.hdmi2': '', "x'": 'bad' },
      inputIcons: { 'com.webos.app.hdmi1': 'pack/switch', 'com.webos.app.hdmi2': 'tv' },
      launchers: [
        { id: 'launcher-abc123', title: 'AirPlay', icon: 'pack/airplay', target: 'airplay' },
        { id: 'launcher-abc123', title: 'Duplicate', icon: '', target: 'airplay' },
        { id: 'launcher-def456', title: '', icon: 'nope', target: 'com.webos.app.miracast' },
        { id: 'bad', title: 'Bad', icon: '', target: 'airplay' },
        { id: 'launcher-ghi789', title: 'No target', icon: '', target: "x'" },
      ],
    }),
  );
  assert.deepEqual(preferences.inputNames, { 'com.webos.app.hdmi1': 'Switch 2' });
  assert.deepEqual(preferences.inputIcons, { 'com.webos.app.hdmi1': 'pack/switch' });
  assert.deepEqual(preferences.launchers, [
    { id: 'launcher-abc123', title: 'AirPlay', icon: 'pack/airplay', target: 'airplay' },
    {
      id: 'launcher-def456',
      title: 'com.webos.app.miracast',
      icon: '',
      target: 'com.webos.app.miracast',
    },
  ]);
  assert.deepEqual(parsePreferences(JSON.stringify({ version: 1 })).launchers, []);
  assert.ok(validLauncherId(newLauncherId()));
});

test('custom names replace the TV label and re-guess the device kind', () => {
  const inputs = [hdmi('hdmi1', 'HDMI 1', true), hdmi('hdmi2', 'Apple TV', true)];
  const named = applyInputNames(inputs, { 'com.webos.app.hdmi1': 'Switch 2' });
  assert.deepEqual(
    named.map((input) => [input.title, input.kind, input.named ?? false, inputHeading(input)]),
    [
      ['Switch 2', 'console', true, 'Switch 2'],
      ['Apple TV', 'streamer', false, 'HDMI 2'],
    ],
  );
  assert.equal(named[1], inputs[1]);
});

test('launchers become Home cards that open their target and hide only when switched off', () => {
  const launchers = [
    { id: 'launcher-aaaaaa', title: 'AirPlay', icon: '', target: 'airplay' },
    { id: 'launcher-bbbbbb', title: 'Mirror', icon: '', target: 'com.webos.app.miracast' },
  ];
  const cards = launcherInputs(launchers, [{ id: 'airplay', title: 'AirPlay on LG' }]);
  assert.deepEqual(
    cards.map((card) => [card.id, card.title, card.port, card.kind, card.target]),
    [
      ['launcher-aaaaaa', 'AirPlay', 'AirPlay on LG', 'launcher', 'airplay'],
      ['launcher-bbbbbb', 'Mirror', 'com.webos.app.miracast', 'launcher', 'com.webos.app.miracast'],
    ],
  );
  const inputs = [hdmi('hdmi1', 'HDMI 1', true), hdmi('hdmi2', 'HDMI 2', false), ...cards];
  assert.deepEqual(
    visibleInputs(inputs, { 'launcher-bbbbbb': 'off', 'com.webos.app.hdmi2': 'on' }).map(
      (input) => input.id,
    ),
    ['com.webos.app.hdmi1', 'com.webos.app.hdmi2', 'launcher-aaaaaa'],
  );
  assert.equal(visibleInputs(cards, { 'launcher-aaaaaa': 'auto' }).length, 2);
});

test('launch targets include hidden system apps but never LumiOS itself', () => {
  const targets = normalizeTargets([
    { id: 'netflix', title: 'Netflix', visible: true },
    { id: 'airplay', title: 'AirPlay', visible: false },
    { id: 'com.dezik.lumios', title: 'LumiOS', visible: true },
    { id: 'com.webos.app.miracast', title: '', visible: false },
    { id: "bad'", title: 'Bad' },
    { id: 'netflix', title: 'Duplicate' },
  ]);
  assert.deepEqual(targets, [
    { id: 'airplay', title: 'AirPlay' },
    { id: 'com.webos.app.miracast', title: 'com.webos.app.miracast' },
    { id: 'netflix', title: 'Netflix' },
  ]);
});

test('input icons come from the user choice or a pack entry listing the input', () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  const pack = parsePack('glyphs', {
    'pack.json': encode(
      JSON.stringify({
        format: 'icnl/1',
        name: 'Glyphs',
        icons: {
          switch: { kind: 'glyph', inputs: ['com.webos.app.hdmi1'] },
          console: { kind: 'glyph' },
        },
      }),
    ),
    'icons/switch/icon.svg': encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    'icons/console/icon.svg': encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  assert.equal(resolveInputIcon('com.webos.app.hdmi1', [pack], {})?.icon.meta.slug, 'switch');
  assert.equal(resolveInputIcon('com.webos.app.hdmi2', [pack], {}), undefined);
  assert.equal(
    resolveInputIcon('com.webos.app.hdmi1', [pack], { 'com.webos.app.hdmi1': 'glyphs/console' })
      ?.icon.meta.slug,
    'console',
  );
  assert.equal(
    resolveInputIcon('com.webos.app.hdmi1', [pack], { 'com.webos.app.hdmi1': 'glyphs/missing' })
      ?.icon.meta.slug,
    'switch',
  );
});
