import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dominantColor,
  imageType,
  parseIconStream,
  parseSizes,
  planBatches,
  readCommand,
  sizeCommand,
  ICON_BATCH_BYTES,
  ICON_SINGLE_BYTES,
} from '../src/tv-icons.ts';
import { normalizeApps, validIconPath } from '../src/catalog.ts';
import { decodeBase64 } from '../src/bridge.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

test('icon paths must be plain absolute image files', () => {
  assert.ok(validIconPath('/media/developer/apps/usr/palm/applications/netflix/icon.png'));
  assert.ok(validIconPath('/usr/palm/applications/com.webos.app.livetv/largeIcon.webp'));
  assert.ok(!validIconPath('relative/icon.png'));
  assert.ok(!validIconPath('/apps/../etc/passwd.png'));
  assert.ok(!validIconPath("/apps/x'; rm -rf /; echo '.png"));
  assert.ok(!validIconPath('/apps/with space/icon.png'));
  assert.ok(!validIconPath('/apps/icon.svg'));
  assert.ok(!validIconPath(`/${'a'.repeat(300)}.png`));
});

test('inventory resolves each app icon against its folder, preferring the large icon', () => {
  const apps = normalizeApps([
    {
      id: 'netflix',
      title: 'Netflix',
      visible: true,
      folderPath: '/media/cryptofs/apps/usr/palm/applications/netflix/',
      icon: 'icon.png',
      largeIcon: '/media/cryptofs/apps/usr/palm/applications/netflix/icon_130x130.png',
    },
    {
      id: 'com.example.relative',
      title: 'Relative',
      visible: true,
      folderPath: '/media/developer/apps/usr/palm/applications/com.example.relative',
      icon: 'icon.png',
    },
    { id: 'com.example.noicon', title: 'No icon', visible: true },
    {
      id: 'com.example.bad',
      title: 'Bad',
      visible: true,
      folderPath: '/apps/bad',
      largeIcon: "x'; reboot; '.png",
      icon: 'fine.png',
    },
  ]);
  const byId = Object.fromEntries(apps.map((app) => [app.id, app.iconPath]));
  assert.equal(byId.netflix, '/media/cryptofs/apps/usr/palm/applications/netflix/icon_130x130.png');
  assert.equal(
    byId['com.example.relative'],
    '/media/developer/apps/usr/palm/applications/com.example.relative/icon.png',
  );
  assert.equal(byId['com.example.noicon'], undefined);
  assert.equal(byId['com.example.bad'], '/apps/bad/fine.png');
});

test('size listing is parsed into a path map and ignores noise', () => {
  const sizes = parseSizes(
    ' 12345 /apps/a/icon.png\n99 /apps/b/large.jpg\n{"returnValue":true}\nx /apps/c.png\n',
  );
  assert.deepEqual(
    [...sizes],
    [
      ['/apps/a/icon.png', 12345],
      ['/apps/b/large.jpg', 99],
    ],
  );
});

test('batches stay under the exec buffer and oversized icons are skipped or read alone', () => {
  const entries = [
    { path: '/a.png', size: 100 * 1024 },
    { path: '/b.png', size: 100 * 1024 },
    { path: '/c.png', size: 100 * 1024 },
    { path: '/d.png', size: ICON_BATCH_BYTES + 1 },
    { path: '/e.png', size: ICON_SINGLE_BYTES + 1 },
    { path: '/f.png', size: 0 },
    { path: '/g.png', size: 10 },
  ];
  assert.deepEqual(planBatches(entries), [['/a.png', '/b.png'], ['/d.png'], ['/c.png', '/g.png']]);
});

test('shell commands quote every path and never exit non-zero', () => {
  const command = readCommand(['/apps/a/icon.png', '/apps/b/icon.png']);
  assert.ok(command.includes("'/apps/a/icon.png' '/apps/b/icon.png'"));
  assert.ok(command.endsWith('; true'));
  assert.ok(sizeCommand(['/apps/a/icon.png']).endsWith('; true'));
});

test('the icon stream yields each file by path and marks missing ones', () => {
  const stream = concat(
    encode(`F ${png.length} /apps/a/icon.png\n`),
    png,
    encode('M 0 /apps/b/icon.png\n'),
    encode('F 3 /apps/c/icon.png\n'),
    new Uint8Array([10, 10, 10]),
    encode('garbage'),
  );
  const files = parseIconStream(stream);
  assert.deepEqual([...files.keys()], ['/apps/a/icon.png', '/apps/b/icon.png', '/apps/c/icon.png']);
  assert.deepEqual([...files.get('/apps/a/icon.png')!], [...png]);
  assert.equal(files.get('/apps/b/icon.png'), null);
  assert.deepEqual([...files.get('/apps/c/icon.png')!], [10, 10, 10]);
  assert.equal(parseIconStream(encode('{"returnValue":true,"devices":[]}')).size, 0);
  assert.equal(parseIconStream(concat(encode('F 99 /apps/short.png\n'), png)).size, 0);
});

test('image types come from magic bytes, not file names', () => {
  assert.equal(imageType(png), 'image/png');
  assert.equal(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(
    imageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    'image/webp',
  );
  assert.equal(imageType(encode('<html>')), '');
});

test('tile colour follows the icon edge, or every opaque pixel when the edge is transparent', () => {
  const size = 16;
  const solid = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) solid.set([200, 30, 40, 255], i * 4);
  assert.equal(dominantColor(solid, size, size), 'rgb(200, 30, 40)');
  const framed = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const edge = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      framed.set(edge ? [10, 20, 30, 255] : [250, 250, 250, 255], (y * size + x) * 4);
    }
  assert.equal(dominantColor(framed, size, size), 'rgb(10, 20, 30)');
  const transparentEdge = new Uint8ClampedArray(size * size * 4);
  for (let y = 4; y < 12; y++)
    for (let x = 4; x < 12; x++) transparentEdge.set([0, 120, 255, 255], (y * size + x) * 4);
  assert.equal(dominantColor(transparentEdge, size, size), 'rgb(0, 120, 255)');
  assert.equal(
    dominantColor(new Uint8ClampedArray(size * size * 4), size, size),
    'rgb(20, 20, 20)',
  );
});

test('base64 service payloads decode to the original bytes', () => {
  assert.deepEqual([...decodeBase64(Buffer.from(png).toString('base64'))], [...png]);
  assert.deepEqual([...decodeBase64('aGVs\nbG8=')], [...encode('hello')]);
});
