// LumiOS icon pack CLI: build, inspect and push .icnl packs, or turn a TV's own app icons into
// a pack. Runs through tsx so it shares the pack format with the app (src/icnl.ts).
//
//   pnpm icnl pack <folder> [--out file.icnl]
//   pnpm icnl inspect <file.icnl>
//   pnpm icnl push <file.icnl> --device tv
//   pnpm icnl from-tv --device tv [--name tv-icons]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { unzipSync, zipSync } from 'fflate';
import { ICNL_FORMAT, iconFileTypes, parsePack, validPackId, validSlug } from '../src/icnl.ts';
import { dominantColor } from '../src/tv-icons.ts';
import { PACKS_DIR, packFileName } from '../src/packs.ts';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const command = args[0];
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const positional = args
  .slice(1)
  .filter((arg, index, all) => !arg.startsWith('--') && !all[index - 1]?.startsWith('--'));

function usage(message) {
  if (message) console.error(message);
  console.error(`Usage:
  pnpm icnl pack <folder> [--out file.icnl]
  pnpm icnl inspect <file.icnl>
  pnpm icnl push <file.icnl> --device tv
  pnpm icnl from-tv --device tv [--name tv-icons]`);
  process.exit(message ? 1 : 0);
}

function ares(tool, toolArgs) {
  const cli = path.join(root, 'node_modules/@webos-tools/cli/bin', `${tool}.js`);
  const result = spawnSync(process.execPath, [cli, ...toolArgs], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${tool} ${toolArgs.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function requireDevice() {
  const device = option('device', 'tv');
  if (!/^[a-zA-Z0-9_-]+$/.test(device)) usage('Pass an ares device profile: --device tv');
  return device;
}

async function readFolder(folder) {
  const files = {};
  const walk = async (dir, prefix) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
      else if (
        relative === 'pack.json' ||
        relative.startsWith('icons/') ||
        relative.startsWith('wallpapers/')
      )
        files[relative] = new Uint8Array(await fs.readFile(path.join(dir, entry.name)));
    }
  };
  await walk(folder, '');
  return files;
}

function summarize(pack) {
  const lines = pack.icons.map(
    (icon) =>
      `  ${icon.meta.slug.padEnd(24)} ${icon.meta.title}${icon.meta.apps.length ? `  apps: ${icon.meta.apps.join(', ')}` : ''}${icon.meta.match ? `  match: /${icon.meta.match}/i` : ''}${icon.css ? '  css' : ''}`,
  );
  const walls = pack.wallpapers.map(
    (wallpaper) =>
      `  ${wallpaper.meta.slug.padEnd(24)} ${wallpaper.meta.title}  ${wallpaper.type || 'css'}`,
  );
  return `${pack.name} v${pack.version}${pack.author ? ` by ${pack.author}` : ''}: ${pack.icons.length} icons, ${pack.wallpapers.length} wallpapers\n${[...lines, ...walls].join('\n')}`;
}

async function buildPack(folder, out) {
  const id = path.basename(path.resolve(folder)).toLowerCase();
  if (!validPackId(id))
    usage(`Folder name "${id}" is not a valid pack id (lowercase letters, digits, . _ -).`);
  const files = await readFolder(folder);
  const pack = parsePack(id, files, { strict: true });
  const bytes = zipSync(files, { level: 6 });
  const target = out ?? path.join(root, 'dist', `${id}.icnl`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  console.log(summarize(pack));
  console.log(`\nWrote ${path.relative(root, target)} (${Math.round(bytes.length / 1024)} KB)`);
  return target;
}

async function inspect(file) {
  const id = path.basename(file, '.icnl').toLowerCase();
  const pack = parsePack(id, unzipSync(new Uint8Array(await fs.readFile(file))), {
    strict: true,
  });
  console.log(summarize(pack));
}

async function push(file) {
  const device = requireDevice();
  await inspect(file);
  const remote = `${PACKS_DIR}/${packFileName(path.basename(file))}`;
  ares('ares-shell', ['--device', device, '-r', `mkdir -p ${PACKS_DIR}`]);
  ares('ares-push', ['--device', device, file, remote]);
  console.log(`\nPushed to ${remote}. Open LumiOS → Settings → Icons → Reread packs.`);
}

async function fromTV() {
  const device = requireDevice();
  const name = option('name', 'tv-icons');
  if (!validPackId(name)) usage(`"${name}" is not a valid pack id.`);
  const sharp = (await import('sharp')).default;
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'lumios-icnl-'));
  ares('ares-push', [
    '--device',
    device,
    path.join(root, 'tools/collect-tv-icons.js'),
    '/tmp/lumios-collect.js',
  ]);
  console.log(
    ares('ares-shell', [
      '--device',
      device,
      '-r',
      'rm -rf /tmp/lumios-artwork; node /tmp/lumios-collect.js',
    ]).trim(),
  );
  ares('ares-pull', ['--device', device, '/tmp/lumios-artwork', work]);
  const map = JSON.parse(await fs.readFile(path.join(work, 'app-icons.json'), 'utf8'));
  const folder = path.join(root, 'packs', name);
  await fs.rm(folder, { recursive: true, force: true });
  await fs.mkdir(path.join(folder, 'icons'), { recursive: true });
  const icons = {};
  for (const [appId, relative] of Object.entries(map)) {
    const extension = path.extname(relative).slice(1).toLowerCase();
    if (!iconFileTypes[extension] || extension === 'svg') continue;
    let slug = appId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    if (!validSlug(slug)) continue;
    for (let n = 2; icons[slug]; n++) slug = `${slug.slice(0, 56)}-${n}`;
    const source = path.join(work, path.basename(relative));
    const dir = path.join(folder, 'icons', slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(source, path.join(dir, `icon.${extension}`));
    const { data } = await sharp(source)
      .resize(48, 48, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    await fs.writeFile(
      path.join(dir, 'style.css'),
      `.icon { background: ${dominantColor(data, 48, 48)}; }\n.icon img { width: 68%; height: 68%; }\n`,
    );
    icons[slug] = { title: appId, apps: [appId] };
  }
  await fs.writeFile(
    path.join(folder, 'pack.json'),
    JSON.stringify(
      {
        format: ICNL_FORMAT,
        name: `TV icons (${device})`,
        version: '1.0.0',
        author: 'LumiOS',
        icons,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Collected ${Object.keys(icons).length} icons into ${path.relative(root, folder)}`);
  await buildPack(folder);
}

try {
  if (command === 'pack' && positional[0]) await buildPack(positional[0], option('out'));
  else if (command === 'inspect' && positional[0]) await inspect(positional[0]);
  else if (command === 'push' && positional[0]) await push(positional[0]);
  else if (command === 'from-tv') await fromTV();
  else usage(command ? `Unknown command or missing argument: ${args.join(' ')}` : undefined);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
