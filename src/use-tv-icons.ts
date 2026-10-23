import { useEffect, useRef, useState } from 'react';
import { isTV } from './bridge';
import { syncTVIcons, TV_TILE_COLOR, type IconRecord } from './tv-icons';
import type { TVApp, TVIcon } from './types';

// Resolves each app's own TV icon to an object URL plus a matching tile colour. Desktop previews
// have no TV to read from and keep the built-in brand artwork.
export function useTVIcons(apps: TVApp[]): Record<string, TVIcon> {
  const [icons, setIcons] = useState<Record<string, TVIcon>>({});
  const urls = useRef(new Map<string, { key: string; url: string }>());
  useEffect(() => {
    if (!isTV() || !apps.length) return;
    const signal = { cancelled: false };
    const apply = (records: IconRecord[]) => {
      if (signal.cancelled) return;
      setIcons((current) => {
        let next = current;
        for (const record of records) {
          const key = `${record.path}:${record.size}:${record.color}`;
          const previous = urls.current.get(record.id);
          if (previous?.key === key) continue;
          if (previous) URL.revokeObjectURL(previous.url);
          urls.current.delete(record.id);
          if (next === current) next = { ...current };
          if (!record.type || !record.bytes.byteLength) {
            delete next[record.id];
            continue;
          }
          const url = URL.createObjectURL(new Blob([record.bytes], { type: record.type }));
          urls.current.set(record.id, { key, url });
          next[record.id] = { url, color: TV_TILE_COLOR };
        }
        return next;
      });
    };
    void syncTVIcons(apps, apply, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [apps]);
  useEffect(() => {
    const held = urls.current;
    return () => {
      for (const { url } of held.values()) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);
  return icons;
}
