import { unzipSync } from 'fflate';
import { execBytes } from './bridge';
import { parsePack, validPackId, type IconPack } from './icnl';
import { openDatabase, readStore, writeStore } from './local-db';
import type { SyncSignal } from './tv-icons';

// Icon packs live as .icnl files in one folder on the TV. They get there over SSH (ares-push,
// Dev Manager) or from a USB drive through Settings. Nothing listens on a port.
export const PACKS_DIR = '/media/developer/lumios/packs';
export const USB_GLOB = '/tmp/usb/*/*/*.icnl';
export const CHUNK_BYTES = 256 * 1024;
export const MAX_PACK_BYTES = 16 * 1024 * 1024;

export interface StoredPack extends IconPack {
  path: string;
  hash: string;
  size: number;
  // Set when the file exists but could not be read as a pack; icons is empty then.
  error?: string;
}

const quote = (value: string) => `'${value}'`;
const decoder = new TextDecoder();

export const validPackPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 300 &&
  value.startsWith(`${PACKS_DIR}/`) &&
  /^[A-Za-z0-9._-]+\.icnl$/.test(value.slice(PACKS_DIR.length + 1)) &&
  !value.slice(PACKS_DIR.length + 1).startsWith('.');

export const packIdForPath = (path: string) =>
  path
    .slice(PACKS_DIR.length + 1, -'.icnl'.length)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');

// File names on the TV stay shell-safe whatever the USB file was called.
export function packFileName(name: string): string {
  const base = name.replace(/^.*\//, '').replace(/\.icnl$/i, '');
  const safe = base
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80);
  return `${safe || 'pack'}.icnl`;
}

export const listCommand = () =>
  `mkdir -p ${quote(PACKS_DIR)}; for f in ${quote(PACKS_DIR)}/*.icnl; do [ -f "$f" ] && printf '%s %s %s\\n' "$(md5sum < "$f" | cut -d' ' -f1)" "$(wc -c < "$f")" "$f"; done; true`;

export function parsePackList(text: string): { path: string; hash: string; size: number }[] {
  const entries: { path: string; hash: string; size: number }[] = [];
  for (const line of text.split('\n')) {
    const match = /^\s*([0-9a-f]{32})\s+(\d+)\s+(\/\S+)\s*$/.exec(line);
    if (match && validPackPath(match[3]))
      entries.push({ path: match[3], hash: match[1], size: Number(match[2]) });
  }
  return entries;
}

export const chunkCommand = (path: string, index: number) =>
  `dd if=${quote(path)} bs=${CHUNK_BYTES} skip=${index} count=1 2>/dev/null`;

export const usbListCommand = () =>
  `for f in ${USB_GLOB}; do [ -f "$f" ] && printf '%s\\n' "$f"; done; true`;

export const validUsbPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 300 &&
  value.startsWith('/tmp/usb/') &&
  value.endsWith('.icnl') &&
  // oxlint-disable-next-line eslint/no-control-regex -- Quotes and control characters cannot be shell-quoted safely.
  !/['\u0000-\u001f\u007f]/.test(value) &&
  !value.includes('/../');

export const parseUsbList = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(validUsbPath);

export function importCommand(sources: string[]): string {
  const copies = sources.map(
    (source) => ` && cp -f ${quote(source)} ${quote(`${PACKS_DIR}/${packFileName(source)}`)}`,
  );
  return `mkdir -p ${quote(PACKS_DIR)}${copies.join('')}`;
}

export const removeCommand = (path: string) => `rm -f ${quote(path)}`;

async function readPackBytes(path: string, size: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (let index = 0; offset < size; index++) {
    const chunk = await execBytes(chunkCommand(path, index));
    if (!chunk.length) break;
    bytes.set(chunk.subarray(0, size - offset), offset);
    offset += chunk.length;
  }
  if (offset !== size) throw new Error('The pack changed while it was being read.');
  return bytes;
}

const acceptPack = (row: unknown): row is StoredPack =>
  !!row &&
  typeof row === 'object' &&
  validPackId((row as StoredPack).id) &&
  validPackPath((row as StoredPack).path) &&
  typeof (row as StoredPack).hash === 'string' &&
  Array.isArray((row as StoredPack).icons);

const byId = (packs: StoredPack[]) => [...packs].sort((a, b) => a.id.localeCompare(b.id));
// Packs cached before wallpapers existed have no wallpapers field.
const withWallpapers = (pack: StoredPack): StoredPack =>
  Array.isArray(pack.wallpapers) ? pack : { ...pack, wallpapers: [] };

export async function readCachedPacks(): Promise<StoredPack[]> {
  const db = await openDatabase();
  return db ? byId((await readStore(db, 'packs', acceptPack)).map(withWallpapers)) : [];
}

// Lists the folder, reads packs whose content hash changed, forgets packs whose files are gone.
// When the TV cannot be read the cached packs stay in use.
export async function syncPacks(signal: SyncSignal): Promise<StoredPack[]> {
  const db = await openDatabase();
  const cached = (db ? await readStore(db, 'packs', acceptPack) : []).map(withWallpapers);
  let listed: { path: string; hash: string; size: number }[];
  try {
    listed = parsePackList(decoder.decode(await execBytes(listCommand())));
  } catch {
    return byId(cached);
  }
  const result: StoredPack[] = [];
  const changed: StoredPack[] = [];
  for (const entry of listed) {
    if (signal.cancelled) return byId(cached);
    const id = packIdForPath(entry.path);
    if (!validPackId(id)) continue;
    const hit = cached.find((pack) => pack.id === id && pack.hash === entry.hash);
    if (hit) {
      result.push(hit);
      continue;
    }
    const base = { id, path: entry.path, hash: entry.hash, size: entry.size };
    let stored: StoredPack;
    try {
      if (entry.size <= 0 || entry.size > MAX_PACK_BYTES)
        throw new Error('The file is empty or larger than 16 MiB.');
      const pack = parsePack(id, unzipSync(await readPackBytes(entry.path, entry.size)));
      stored = { ...pack, ...base };
    } catch (error) {
      stored = {
        ...base,
        name: id,
        version: '',
        author: '',
        icons: [],
        wallpapers: [],
        error: error instanceof Error ? error.message : 'The file is not a valid .icnl pack.',
      };
    }
    result.push(stored);
    changed.push(stored);
  }
  const keep = new Set(result.map((pack) => pack.id));
  const removals = cached.filter((pack) => !keep.has(pack.id)).map((pack) => pack.id);
  if (db && (changed.length || removals.length)) await writeStore(db, 'packs', changed, removals);
  return byId(result);
}

export async function importPacksFromUsb(): Promise<number> {
  const found = parseUsbList(decoder.decode(await execBytes(usbListCommand())));
  if (!found.length) return 0;
  await execBytes(importCommand(found.slice(0, 50)));
  return found.length;
}

export async function removePackFile(pack: StoredPack): Promise<void> {
  if (!validPackPath(pack.path)) throw new Error('Invalid pack path.');
  await execBytes(removeCommand(pack.path));
}
