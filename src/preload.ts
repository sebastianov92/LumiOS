import { useCallback, useEffect, useRef, useState } from 'react';
import { execBytes, isTV } from './bridge';

// System preload: LumiOS registered with LG's preload manager (the Netflix/YouTube mechanism)
// through the packaged tv/preload.js, run as root by Homebrew Channel. Launch-level keep-alive
// is a launch parameter and lives in tv/autostart.sh and the Home key mapping instead.
export const APP_ID = 'com.dezik.lumios';
export const APP_DIRS = [
  `/media/developer/apps/usr/palm/applications/${APP_ID}`,
  `/media/cryptofs/apps/usr/palm/applications/${APP_ID}`,
];
export type PreloadAction = 'status' | 'enable' | 'disable';

export interface PreloadStatus {
  enabled: boolean;
  entries: number;
  backup: boolean;
}

export function preloadCommand(action: PreloadAction): string {
  const dirs = APP_DIRS.map((dir) => `'${dir}'`).join(' ');
  return `for d in ${dirs}; do if [ -f "$d/preload.js" ]; then exec /usr/bin/node "$d/preload.js" ${action}; fi; done; printf '%s\\n' '{"error":"preload.js is not installed with this build."}'`;
}

// The script prints one JSON line last; anything before it is noise from the TV.
export function parsePreloadStatus(text: string): PreloadStatus {
  const line = text
    .trim()
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('{'))
    .pop();
  if (!line) throw new Error('The TV returned no preload status.');
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error('The TV returned an unreadable preload status.');
  }
  if (!value || typeof value !== 'object') throw new Error('The TV returned no preload status.');
  const reply = value as Record<string, unknown>;
  if (typeof reply.error === 'string') throw new Error(reply.error.slice(0, 240));
  return {
    enabled: reply.enabled === true,
    entries: typeof reply.entries === 'number' ? reply.entries : 0,
    backup: reply.backup === true,
  };
}

const decoder = new TextDecoder();

export async function runPreload(action: PreloadAction): Promise<PreloadStatus> {
  return parsePreloadStatus(decoder.decode(await execBytes(preloadCommand(action), 30000)));
}

export interface SystemPreload {
  // null until the TV answered; false when the TV has no usable preload manager.
  available: boolean | null;
  enabled: boolean;
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
  toggle: () => Promise<PreloadStatus>;
}

export function useSystemPreload(): SystemPreload {
  const [available, setAvailable] = useState<boolean | null>(isTV() ? null : false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!isTV()) return;
    try {
      const status = await runPreload('status');
      if (!alive.current) return;
      setAvailable(true);
      setEnabled(status.enabled);
      setError('');
    } catch (failure) {
      if (!alive.current) return;
      setAvailable(false);
      setError(failure instanceof Error ? failure.message : '');
    }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Ask the TV once on mount.
    void refresh();
  }, [refresh]);
  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      const status = await runPreload(enabled ? 'disable' : 'enable');
      if (alive.current) {
        setAvailable(true);
        setEnabled(status.enabled);
        setError('');
      }
      return status;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [enabled]);
  return { available, enabled, busy, error, refresh, toggle };
}
