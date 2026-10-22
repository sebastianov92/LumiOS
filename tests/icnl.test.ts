import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync } from 'fflate';
import {
  findIcon,
  parseIconRef,
  parseManifest,
  parsePack,
  resolveAppIcon,
  scopeIconCss,
  validIconOverride,
  type IconPack,
} from '../src/icnl.ts';
import {
  chunkCommand,
  importCommand,
  listCommand,
  packFileName,
  packIdForPath,
  parsePackList,
  parseUsbList,
  PACKS_DIR,
  validPackPath,
} from '../src/packs.ts';
import { parsePreferences } from '../src/storage.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const manifest = {
  format: 'icnl/1',
  name: 'Test pack',
  version: '1.2.0',
  author: 'Dezik',
  icons: {
    netflix: { title: 'Netflix', apps: ['netflix'], match: 'netflix' },
    stream: { title: 'Any streamer', match: 'plex|jellyfin' },
    switch: { title: 'Switch', kind: 'glyph', inputs: ['com.webos.app.hdmi1'] },
  },
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const files = () => ({
  'pack.json': encode(JSON.stringify(manifest)),
  'icons/netflix/icon.svg': encode(svg),
  'icons/netflix/style.css': encode('.icon { background: #141414; }\n.icon img { width: 76%; }'),
  'icons/stream/icon.svg': encode(svg),
  'icons/switch/icon.svg': encode(svg),
});

test('pack manifests are validated and normalized', () => {
  const parsed = parseManifest(manifest);
  assert.equal(parsed.name, 'Test pack');
  assert.deepEqual(
    parsed.icons.map((icon) => [icon.slug, icon.kind, icon.apps, icon.inputs, icon.match]),
    [
      ['netflix', 'tile', ['netflix'], [], 'netflix'],
      ['stream', 'tile', [], [], 'plex|jellyfin'],
      ['switch', 'glyph', [], ['com.webos.app.hdmi1'], ''],
    ],
  );
  assert.throws(() => parseManifest({ ...manifest, format: 'icnl/2' }), /Unsupported pack format/);
  assert.throws(() => parseManifest({ ...manifest, name: '' }), /needs a "name"/);
  assert.throws(
    () => parseManifest({ ...manifest, icons: { 'Bad Slug': {} } }),
    /Invalid icon slug/,
  );
  assert.throws(
    () => parseManifest({ ...manifest, icons: { x: { match: '(' } } }),
    /invalid "match"/,
  );
  assert.throws(() => parseManifest({ ...manifest, icons: {} }), /lists no icons/);
  assert.equal(parseManifest({ ...manifest, version: undefined }).version, '0.0.0');
});

test('pack CSS is scoped to one tile and stripped of imports, at-rules and remote URLs', () => {
  const css = `
    /* comment */
    @import url("http://evil.example/x.css");
    .icon { background: #141414; color: white }
    .icon img, .icon:hover { width: 76%; }
    .icon-title { color: red; }
    img { content: url(http://evil.example/a.png); width: 1px }
    .icon { background-image: url("data:image/png;base64,AAAA"); behavior: url(x.htc) }
    @media (min-width: 1px) { .icon { color: blue } }
    .icon { width: expression(alert(1)); height: 1px }
  `;
  const scope = '.app-face[data-icnl="pack/netflix"]';
  assert.equal(
    scopeIconCss(css, scope),
    [
      `${scope} { background: #141414; color: white; }`,
      `${scope} img, ${scope}:hover { width: 76%; }`,
      `${scope} .icon-title { color: red; }`,
      `${scope} img { width: 1px; }`,
      `${scope} { background-image: url("data:image/png;base64,AAAA"); }`,
      `${scope} { height: 1px; }`,
    ].join('\n'),
  );
  assert.equal(scopeIconCss('', scope), '');
});

test('packs are read from zip entries, with or without a wrapping folder', () => {
  const pack = parsePack('test', files());
  assert.equal(pack.id, 'test');
  assert.equal(pack.icons.length, 3);
  assert.equal(pack.icons[0].type, 'image/svg+xml');
  assert.equal(new TextDecoder().decode(pack.icons[0].data), svg);
  assert.match(pack.icons[0].css, /background: #141414/);
  assert.equal(pack.icons[1].css, '');
  const nested = Object.fromEntries(
    Object.entries(files()).map(([name, data]) => [`test-pack/${name}`, data]),
  );
  assert.equal(parsePack('test', nested).icons.length, 3);
  const unzipped = parsePack('zipped', Object.fromEntries(Object.entries(files())));
  assert.equal(unzipped.name, 'Test pack');
  assert.ok(zipSync(files()).length > 0);
});

test('missing icon files are skipped on the TV but rejected by the strict CLI', () => {
  const partial = files();
  delete (partial as Record<string, unknown>)['icons/stream/icon.svg'];
  assert.equal(parsePack('test', partial).icons.length, 2);
  assert.throws(() => parsePack('test', partial, { strict: true }), /has no icons\/stream\/icon/);
  assert.throws(() => parsePack('test', { 'pack.json': encode('{') }), /not valid JSON/);
  assert.throws(() => parsePack('test', { 'icons/x/icon.svg': encode(svg) }), /no pack\.json/);
  assert.throws(() => parsePack('Bad Id', files()), /Invalid pack id/);
});

test('icons resolve by override, exact app id, then match pattern, in pack order', () => {
  const first = parsePack('a-pack', files());
  const second: IconPack = parsePack('b-pack', {
    'pack.json': encode(
      JSON.stringify({
        format: 'icnl/1',
        name: 'B',
        icons: { plex: { title: 'Plex', apps: ['plex'] }, generic: { title: 'Any', match: '.' } },
      }),
    ),
    'icons/plex/icon.png': new Uint8Array([1, 2, 3]),
    'icons/generic/icon.png': new Uint8Array([1]),
  });
  const packs = [first, second];
  const netflix = { id: 'netflix', title: 'Netflix' };
  const plex = { id: 'plex', title: 'Plex' };
  const kodi = { id: 'org.xbmc.kodi', title: 'Kodi' };
  assert.equal(resolveAppIcon(netflix, packs, {})?.icon.meta.slug, 'netflix');
  assert.equal(resolveAppIcon(plex, packs, {})?.icon.meta.slug, 'plex');
  assert.equal(
    resolveAppIcon({ id: 'org.jellyfin.webos', title: 'Jellyfin' }, packs, {})?.icon.meta.slug,
    'stream',
  );
  assert.equal(resolveAppIcon(kodi, packs, {})?.icon.meta.slug, 'generic');
  assert.equal(resolveAppIcon(netflix, packs, { netflix: 'b-pack/plex' })?.icon.meta.slug, 'plex');
  assert.equal(resolveAppIcon(netflix, packs, { netflix: 'tv' }), undefined);
  assert.equal(
    resolveAppIcon(netflix, packs, { netflix: 'missing/icon' })?.icon.meta.slug,
    'netflix',
  );
  assert.equal(findIcon(packs, 'a-pack/switch')?.icon.meta.kind, 'glyph');
  assert.equal(resolveAppIcon({ id: 'x', title: 'switch' }, [first], {}), undefined);
  assert.deepEqual(parseIconRef('a-pack/netflix'), { packId: 'a-pack', slug: 'netflix' });
  assert.equal(parseIconRef('nope'), null);
  assert.ok(validIconOverride('tv'));
  assert.ok(!validIconOverride('a-pack/Bad'));
});

test('icon overrides persist only when they reference valid apps and icons', () => {
  const preferences = parsePreferences(
    JSON.stringify({
      version: 1,
      iconOverrides: { netflix: 'luma-brands/netflix', plex: 'tv', bad: 'nope', "x'": 'a/b' },
    }),
  );
  assert.deepEqual(preferences.iconOverrides, { netflix: 'luma-brands/netflix', plex: 'tv' });
  assert.deepEqual(parsePreferences(JSON.stringify({ version: 1 })).iconOverrides, {});
});

test('pack files on the TV are listed by content hash and read in fixed chunks', () => {
  const list = parsePackList(
    `d41d8cd98f00b204e9800998ecf8427e 1234 ${PACKS_DIR}/luma-brands.icnl\nxx 1 ${PACKS_DIR}/bad.icnl\nd41d8cd98f00b204e9800998ecf8427e 5 /etc/evil.icnl\n{"returnValue":true}\n`,
  );
  assert.deepEqual(list, [
    { path: `${PACKS_DIR}/luma-brands.icnl`, hash: 'd41d8cd98f00b204e9800998ecf8427e', size: 1234 },
  ]);
  assert.equal(packIdForPath(`${PACKS_DIR}/Luma Brands.icnl`), 'luma-brands');
  assert.ok(validPackPath(`${PACKS_DIR}/a_b-c.1.icnl`));
  assert.ok(!validPackPath(`${PACKS_DIR}/sub/a.icnl`));
  assert.ok(!validPackPath(`${PACKS_DIR}/.hidden.icnl`));
  assert.ok(!validPackPath(`${PACKS_DIR}/a b.icnl`));
  assert.ok(listCommand().includes('md5sum'));
  assert.equal(
    chunkCommand(`${PACKS_DIR}/x.icnl`, 3),
    `dd if='${PACKS_DIR}/x.icnl' bs=262144 skip=3 count=1 2>/dev/null`,
  );
});

test('USB packs are copied under shell-safe names', () => {
  const found = parseUsbList(
    "/tmp/usb/sda/sda1/My Icons.icnl\n/tmp/usb/sda/sda1/evil'.icnl\n/etc/passwd.icnl\n/tmp/usb/sdb/sdb1/../x.icnl\n",
  );
  assert.deepEqual(found, ['/tmp/usb/sda/sda1/My Icons.icnl']);
  assert.equal(packFileName('/tmp/usb/sda/sda1/My Icons.icnl'), 'My-Icons.icnl');
  assert.equal(packFileName('.hidden'), 'hidden.icnl');
  assert.equal(packFileName('!!!'), 'pack.icnl');
  assert.equal(
    importCommand(found),
    `mkdir -p '${PACKS_DIR}' && cp -f '/tmp/usb/sda/sda1/My Icons.icnl' '${PACKS_DIR}/My-Icons.icnl'`,
  );
});
