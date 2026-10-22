// Inspect the actual IPK, and normalize only LumiOS-owned entries. The webOS CLI
// emits world-writable directories; boot scripts need app-owned 0755 parents.
import { gunzipSync, gzipSync } from 'node:zlib';

function members(bytes) {
  if (bytes.subarray(0, 8).toString() !== '!<arch>\n') throw new Error('Not an IPK/ar archive.');
  const result = [];
  for (let offset = 8; offset + 60 <= bytes.length;) {
    const header = Buffer.from(bytes.subarray(offset, offset + 60));
    const size = Number(header.subarray(48, 58).toString().trim());
    if (!Number.isSafeInteger(size) || size < 0 || offset + 60 + size > bytes.length)
      throw new Error('Invalid IPK archive member.');
    result.push({
      header,
      name: header.subarray(0, 16).toString().trim().replace(/\/$/, ''),
      data: bytes.subarray(offset + 60, offset + 60 + size),
    });
    offset += 60 + size + (size % 2);
  }
  return result;
}

function entries(tar) {
  const result = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) =>
      header
        .subarray(start, start + length)
        .toString()
        .replace(/\0.*$/, '');
    const size = parseInt(text(124, 12).trim(), 8) || 0;
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length)
      throw new Error('Invalid package tar member.');
    const prefix = text(345, 155);
    result.push({
      header,
      name: (prefix ? `${prefix}/` : '') + text(0, 100),
      type: text(156, 1),
      data: tar.subarray(offset + 512, offset + 512 + size),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return result;
}

export function normalizeAndVerifyPackage(bytes, manifest) {
  const archive = members(bytes);
  const member = archive.find((entry) => entry.name === 'data.tar.gz');
  if (!member || !archive.some((entry) => entry.name === 'control.tar.gz'))
    throw new Error('Incomplete IPK.');
  const tar = gunzipSync(member.data);
  const files = entries(tar);
  const owned = files.filter((file) => file.name.split('/').includes(manifest.id));
  if (!owned.length) throw new Error('The IPK contains no LumiOS app directory.');
  const appinfo = owned.find((file) => file.name.endsWith('/appinfo.json'));
  const actual = appinfo && JSON.parse(appinfo.data.toString());
  if (actual?.id !== manifest.id || actual?.version !== manifest.version)
    throw new Error('Packaged app metadata does not match the source.');
  if (JSON.stringify(actual.requiredACG) !== JSON.stringify(manifest.requiredACG))
    throw new Error('Packaged app permissions do not match the source.');
  if (actual.icon !== manifest.icon || actual.largeIcon !== manifest.largeIcon)
    throw new Error('Packaged icon paths do not match the source.');
  for (const required of [
    'index.html',
    'app.js',
    'app.css',
    manifest.icon,
    manifest.largeIcon,
    'autostart.sh',
    'preload.js',
    'fonts/inter-latin.woff2',
    'wallpapers/dunes.jpg',
    'wallpapers/midnight.svg',
    'wallpapers/san-francisco.jpg',
    'wallpapers/summit.jpg',
    'wallpapers/slate.svg',
    'wallpapers/forest.jpg',
    'wallpapers/prism.svg',
    'wallpapers/yosemite.jpg',
    'wallpapers/northern-lights.jpg',
    'wallpapers/flow.svg',
    'wallpaper-thumbnails/dunes.jpg',
    'wallpaper-thumbnails/san-francisco.jpg',
    'wallpaper-thumbnails/summit.jpg',
    'wallpaper-thumbnails/forest.jpg',
    'wallpaper-thumbnails/yosemite.jpg',
    'wallpaper-thumbnails/northern-lights.jpg',
    'logos/apple-tv.svg',
    'logos/prime-video.svg',
    'logos/disney-plus.svg',
    'logos/jellyfin.svg',
    'logos/netflix.svg',
    'logos/youtube.svg',
    'logos/arte.svg',
    'logos/zdf.svg',
    'logos/das-erste.svg',
  ]) {
    if (!owned.some((file) => file.name.endsWith(`/${required}`) && file.data.length > 0))
      throw new Error(`Package is missing ${required}.`);
  }
  for (const file of owned) {
    if (!['', '0', '5'].includes(file.type))
      throw new Error(`Unexpected package entry type: ${file.name}`);
    const executable = file.type === '5' || file.name.endsWith('/autostart.sh');
    file.header.write(executable ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
    file.header.fill(32, 148, 156);
    const sum = file.header.reduce((total, byte) => total + byte, 0);
    file.header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  }
  member.data = gzipSync(tar, { level: 9 });
  const parts = [Buffer.from('!<arch>\n')];
  for (const entry of archive) {
    entry.header.write(String(entry.data.length).padEnd(10, ' '), 48, 10, 'ascii');
    parts.push(entry.header, entry.data);
    if (entry.data.length % 2) parts.push(Buffer.from('\n'));
  }
  console.log(
    `Verified IPK contents: ${owned.length} LumiOS entries; app metadata, assets and modes checked.`,
  );
  return Buffer.concat(parts);
}
