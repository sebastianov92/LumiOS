import { useCallback, useEffect, useRef, useState } from 'react';
import { isTV } from './bridge';
import { iconRef, scopeIconCss, wallpaperRef } from './icnl';
import { importPacksFromUsb, removePackFile, syncPacks, type StoredPack } from './packs';
import { devPacksEnabled, loadDevPacks } from './dev-packs';

export interface PackLibrary {
  packs: StoredPack[];
  // Object URL per "pack/slug" icon reference.
  urls: Map<string, string>;
  // Object URL per "pack/slug" image wallpaper reference.
  wallpaperUrls: Map<string, string>;
  loading: boolean;
  reload: () => Promise<StoredPack[]>;
  importFromUsb: () => Promise<number>;
  remove: (pack: StoredPack) => Promise<void>;
}

const STYLE_ID = 'icnl-styles';

// Keeps the installed icon packs in state, with an object URL per icon and one injected
// stylesheet holding every pack's scoped tile CSS.
export function usePacks(): PackLibrary {
  const [packs, setPacks] = useState<StoredPack[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const [wallpaperUrls, setWallpaperUrls] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const signal = useRef({ cancelled: false });
  const busy = useRef<Promise<StoredPack[]> | null>(null);

  const reload = useCallback(() => {
    if (busy.current) return busy.current;
    // Desktop previews have no pack folder; with ?packs they load the repository's examples.
    if (!isTV() && !devPacksEnabled()) return Promise.resolve([] as StoredPack[]);
    setLoading(true);
    const run = (
      isTV()
        ? syncPacks(signal.current)
        : loadDevPacks().then((packs) =>
            packs.map((pack) => ({ ...pack, path: `/packs/${pack.id}`, hash: 'dev', size: 0 })),
          )
    )
      .catch(() => [] as StoredPack[])
      .then((next) => {
        // Keep the same array when nothing changed so dependent memos and tiles stay put.
        if (!signal.current.cancelled)
          setPacks((current) =>
            current.length === next.length &&
            current.every(
              (pack, index) => pack.id === next[index].id && pack.hash === next[index].hash,
            )
              ? current
              : next,
          );
        return next;
      })
      .finally(() => {
        busy.current = null;
        if (!signal.current.cancelled) setLoading(false);
      });
    busy.current = run;
    return run;
  }, []);

  useEffect(() => {
    const current = signal.current;
    current.cancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect -- Start the TV read once on mount.
    void reload();
    return () => {
      current.cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    const next = new Map<string, string>();
    for (const pack of packs)
      for (const icon of pack.icons)
        next.set(
          iconRef(pack.id, icon.meta.slug),
          URL.createObjectURL(new Blob([icon.data], { type: icon.type })),
        );
    const walls = new Map<string, string>();
    for (const pack of packs)
      for (const wallpaper of pack.wallpapers)
        if (wallpaper.type)
          walls.set(
            wallpaperRef(pack.id, wallpaper.meta.slug),
            URL.createObjectURL(new Blob([wallpaper.data], { type: wallpaper.type })),
          );
    // oxlint-disable-next-line react/set-state-in-effect -- Object URLs derive from the loaded packs.
    setUrls((current) => (current.size === 0 && next.size === 0 ? current : next));
    // oxlint-disable-next-line react/set-state-in-effect -- Object URLs derive from the loaded packs.
    setWallpaperUrls((current) => (current.size === 0 && walls.size === 0 ? current : walls));
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.append(style);
    }
    const css = packs
      .flatMap((pack) => [
        ...pack.icons
          .filter((icon) => icon.css)
          .flatMap((icon) =>
            ['.app-face', '.icon-preview'].map((root) =>
              scopeIconCss(icon.css, `${root}[data-icnl="${iconRef(pack.id, icon.meta.slug)}"]`),
            ),
          ),
        // CSS wallpapers paint the Home background and their Settings thumbnail.
        ...pack.wallpapers
          .filter((wallpaper) => wallpaper.css)
          .flatMap((wallpaper) =>
            ['.wallpaper', '.wallpaper-thumbnail'].map((root) =>
              scopeIconCss(
                wallpaper.css,
                `${root}[data-wallpaper="${wallpaperRef(pack.id, wallpaper.meta.slug)}"]`,
                '.wallpaper',
              ),
            ),
          ),
      ])
      .join('\n');
    if (style.textContent !== css) style.textContent = css;
    return () => {
      for (const url of next.values()) URL.revokeObjectURL(url);
      for (const url of walls.values()) URL.revokeObjectURL(url);
    };
  }, [packs]);

  const importFromUsb = useCallback(async () => {
    const count = await importPacksFromUsb();
    if (count) await reload();
    return count;
  }, [reload]);

  const remove = useCallback(
    async (pack: StoredPack) => {
      await removePackFile(pack);
      await reload();
    },
    [reload],
  );

  return { packs, urls, wallpaperUrls, loading, reload, importFromUsb, remove };
}
