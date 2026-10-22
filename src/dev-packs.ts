import { parsePack, type IconPack } from './icnl';

// Desktop preview only: load the repository's example packs from /packs/<name>/ so icons and
// wallpapers can be tried without a TV. Enabled by adding ?packs to the preview URL.
export const devPacksEnabled = () =>
  typeof location !== 'undefined' && /[?&]packs(?:=[^&]*)?(?:&|$)/.test(location.search);

const iconFiles = ['icon.svg', 'icon.png', 'icon.jpg', 'icon.webp', 'style.css'];
const wallpaperFiles = ['image.jpg', 'image.png', 'image.webp', 'style.css'];

async function grab(files: Record<string, Uint8Array>, base: string, path: string) {
  try {
    // Vite would wrap a fetched .css file in a JS module; ?direct asks for the stylesheet itself.
    const response = await fetch(base + path + (path.endsWith('.css') ? '?direct' : ''));
    // The dev server answers missing files with index.html; skip those.
    if (!response.ok || (response.headers.get('content-type') ?? '').includes('text/html')) return;
    files[path] = new Uint8Array(await response.arrayBuffer());
  } catch {
    /* Not available in this preview. */
  }
}

export async function loadDevPacks(): Promise<IconPack[]> {
  const names = (await (await fetch('/packs/dev.json')).json()) as unknown;
  if (!Array.isArray(names)) return [];
  const packs: IconPack[] = [];
  for (const name of names) {
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) continue;
    const base = `/packs/${name}/`;
    const manifestText = await (await fetch(`${base}pack.json`)).text();
    const files: Record<string, Uint8Array> = {
      'pack.json': new TextEncoder().encode(manifestText),
    };
    const manifest = JSON.parse(manifestText) as { icons?: object; wallpapers?: object };
    for (const slug of Object.keys(manifest.icons ?? {}))
      for (const file of iconFiles) await grab(files, base, `icons/${slug}/${file}`);
    for (const slug of Object.keys(manifest.wallpapers ?? {}))
      for (const file of wallpaperFiles) await grab(files, base, `wallpapers/${slug}/${file}`);
    try {
      packs.push(parsePack(name, files));
    } catch {
      /* A broken example pack is skipped in the preview. */
    }
  }
  return packs;
}
