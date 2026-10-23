import { execBytes } from './bridge';
import { validIconPath } from './catalog';
import { openDatabase, readStore, writeStore } from './local-db';
import type { TVApp } from './types';

// Every installed app ships its own icon on the TV. LumiOS reads those files through Homebrew
// Channel's root shell and caches them locally, so every app gets a real icon without any
// bundled artwork. Replies must stay well below the service's 1 MiB exec buffer, so reads are
// planned by file size and batched.
export const ICON_BATCH_BYTES = 256 * 1024;
export const ICON_SINGLE_BYTES = 512 * 1024;
const SIZE_QUERY_PATHS = 60;
export const FALLBACK_COLOR = 'rgb(20, 20, 20)';
// LG system apps whose icons look wrong on a sampled colour; they sit on the brand-tile black.
export const TV_TILE_COLOR = '#141414';
export const darkTileApps = new Set([
  'com.webos.app.discovery',
  'com.webos.app.homeconnect',
  'com.webos.app.mediadiscovery',
]);

export interface IconRecord {
  id: string;
  path: string;
  size: number;
  // Empty type marks a path that exists in the inventory but could not be read as an image.
  type: string;
  bytes: ArrayBuffer;
  color: string;
}

// validIconPath forbids quotes and whitespace, so single quotes are a complete escape.
const quote = (path: string) => `'${path}'`;

export function sizeCommand(paths: string[]): string {
  return `for f in ${paths.map(quote).join(' ')}; do [ -f "$f" ] && printf '%s %s\\n' "$(wc -c < "$f")" "$f"; done; true`;
}

export function parseSizes(text: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\/\S+)\s*$/.exec(line);
    if (match && validIconPath(match[2])) sizes.set(match[2], Number(match[1]));
  }
  return sizes;
}

export function planBatches(
  entries: { path: string; size: number }[],
  limit = ICON_BATCH_BYTES,
  single = ICON_SINGLE_BYTES,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let total = 0;
  for (const { path, size } of entries) {
    if (!Number.isFinite(size) || size <= 0 || size > single) continue;
    if (size > limit) {
      batches.push([path]);
      continue;
    }
    if (total + size > limit && current.length) {
      batches.push(current);
      current = [];
      total = 0;
    }
    current.push(path);
    total += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function readCommand(paths: string[]): string {
  return `for f in ${paths.map(quote).join(' ')}; do if [ -f "$f" ]; then printf 'F %s %s\\n' "$(wc -c < "$f")" "$f"; cat "$f"; else printf 'M 0 %s\\n' "$f"; fi; done; true`;
}

const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);

// The stream is a sequence of "F <size> <path>\n<bytes>" or "M 0 <path>\n" entries.
export function parseIconStream(bytes: Uint8Array): Map<string, Uint8Array | null> {
  const files = new Map<string, Uint8Array | null>();
  let offset = 0;
  while (offset < bytes.length) {
    const end = bytes.indexOf(10, offset);
    if (end < 0 || end - offset > 400) break;
    const header = /^([FM])\s+(\d+)\s+(\/\S+)$/.exec(ascii(bytes.subarray(offset, end)));
    offset = end + 1;
    if (!header) break;
    const [, flag, length, path] = header;
    if (flag === 'M') {
      files.set(path, null);
      continue;
    }
    const size = Number(length);
    if (offset + size > bytes.length) break;
    files.set(path, bytes.slice(offset, offset + size));
    offset += size;
  }
  return files;
}

export function imageType(bytes: Uint8Array): string {
  const [a, b, c, d] = bytes;
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return 'image/png';
  if (a === 0xff && b === 0xd8) return 'image/jpeg';
  if (
    a === 0x52 &&
    b === 0x49 &&
    c === 0x46 &&
    d === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  return '';
}

// Tile backgrounds extend the icon's own edge colour across the card: bin opaque edge pixels
// by 4-bit RGB and average the largest bin. Icons with transparent edges use every opaque pixel.
export function dominantColor(
  data: ArrayLike<number>,
  width: number,
  height: number,
  edge = true,
): string {
  const inset = Math.round(Math.min(width, height) / 8);
  const bins = new Map<string, { n: number; sum: [number, number, number] }>();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (edge && x >= inset && x < width - inset && y >= inset && y < height - inset) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 230) continue;
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      const bin = bins.get(key) ?? { n: 0, sum: [0, 0, 0] };
      bin.n++;
      bin.sum[0] += data[i];
      bin.sum[1] += data[i + 1];
      bin.sum[2] += data[i + 2];
      bins.set(key, bin);
    }
  const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) return edge ? dominantColor(data, width, height, false) : FALLBACK_COLOR;
  return `rgb(${best.sum.map((value) => Math.round(value / best.n)).join(', ')})`;
}

async function analyzeColor(blob: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: 48,
      resizeHeight: 48,
      resizeQuality: 'low',
    });
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return FALLBACK_COLOR;
    context.drawImage(bitmap, 0, 0, 48, 48);
    bitmap.close();
    return dominantColor(context.getImageData(0, 0, 48, 48).data, 48, 48);
  } catch {
    return FALLBACK_COLOR;
  }
}

const acceptRecord = (record: unknown): record is IconRecord =>
  !!record &&
  typeof record === 'object' &&
  typeof (record as IconRecord).id === 'string' &&
  validIconPath((record as IconRecord).path) &&
  (record as IconRecord).bytes instanceof ArrayBuffer;
const readAll = (db: IDBDatabase) => readStore(db, 'tv-icons', acceptRecord);
const write = (db: IDBDatabase, records: IconRecord[], removals: string[]) =>
  writeStore(db, 'tv-icons', records, removals);

const missing = (id: string, path: string): IconRecord => ({
  id,
  path,
  size: 0,
  type: '',
  bytes: new ArrayBuffer(0),
  color: '',
});

async function readBatch(paths: string[]): Promise<Map<string, Uint8Array | null>> {
  try {
    return parseIconStream(await execBytes(readCommand(paths)));
  } catch {
    if (paths.length === 1) return new Map([[paths[0], null]]);
    // A batch that overflowed the service buffer is retried one file at a time.
    const files = new Map<string, Uint8Array | null>();
    for (const path of paths)
      for (const [key, value] of await readBatch([path])) files.set(key, value);
    return files;
  }
}

export interface SyncSignal {
  cancelled: boolean;
}

// Emits cached icons immediately, then reads the rest from the TV in size-bounded batches.
export async function syncTVIcons(
  apps: TVApp[],
  emit: (records: IconRecord[]) => void,
  signal: SyncSignal,
): Promise<void> {
  const wanted = new Map<string, string>();
  for (const app of apps)
    if (app.iconPath && validIconPath(app.iconPath)) wanted.set(app.id, app.iconPath);
  const db = await openDatabase();
  const cached = db ? await readAll(db) : [];
  if (signal.cancelled) return;
  const fresh = cached.filter((record) => wanted.get(record.id) === record.path);
  // Records written while every tile was black carry the constant instead of a sampled colour;
  // sample them again from the cached bytes without touching the TV.
  const repaired: IconRecord[] = [];
  for (const record of fresh)
    if (record.type && record.color === TV_TILE_COLOR) {
      record.color = await analyzeColor(new Blob([record.bytes], { type: record.type }));
      repaired.push(record);
    }
  if (db && repaired.length) await write(db, repaired, []);
  const stale = cached
    .filter((record) => wanted.get(record.id) !== record.path)
    .map((record) => record.id);
  if (fresh.length) emit(fresh.filter((record) => record.type));
  const pending = [...wanted].filter(([id]) => !fresh.some((record) => record.id === id));
  if (db && stale.length) await write(db, [], stale);
  if (!pending.length) return;

  const idsByPath = new Map<string, string[]>();
  for (const [id, path] of pending) idsByPath.set(path, [...(idsByPath.get(path) ?? []), id]);
  const paths = [...idsByPath.keys()];
  const sizes = new Map<string, number>();
  for (let index = 0; index < paths.length; index += SIZE_QUERY_PATHS) {
    if (signal.cancelled) return;
    try {
      const text = new TextDecoder().decode(
        await execBytes(sizeCommand(paths.slice(index, index + SIZE_QUERY_PATHS))),
      );
      for (const [path, size] of parseSizes(text)) sizes.set(path, size);
    } catch {
      return;
    }
  }
  const unreadable: IconRecord[] = [];
  for (const path of paths) {
    const size = sizes.get(path);
    if (size === undefined || size <= 0 || size > ICON_SINGLE_BYTES)
      for (const id of idsByPath.get(path) ?? []) unreadable.push(missing(id, path));
  }
  if (unreadable.length) {
    if (db) await write(db, unreadable, []);
    emit(unreadable);
  }
  const batches = planBatches(
    paths.flatMap((path) => (sizes.has(path) ? [{ path, size: sizes.get(path)! }] : [])),
  );
  for (const batch of batches) {
    if (signal.cancelled) return;
    const files = await readBatch(batch);
    const records: IconRecord[] = [];
    for (const path of batch) {
      const bytes = files.get(path) ?? null;
      const type = bytes ? imageType(bytes) : '';
      const ids = idsByPath.get(path) ?? [];
      if (!bytes || !type) {
        for (const id of ids) records.push(missing(id, path));
        continue;
      }
      // Copy into a standalone ArrayBuffer so IndexedDB stores the icon alone, not the batch.
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const color = await analyzeColor(new Blob([buffer], { type }));
      for (const id of ids)
        records.push({ id, path, size: bytes.byteLength, type, bytes: buffer, color });
    }
    if (signal.cancelled) return;
    if (db) await write(db, records, []);
    emit(records);
  }
}
