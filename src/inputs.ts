import { inputKind, validAppId } from './catalog';
import { parseIconRef } from './icnl';
import type { AppTarget, InputVisibility, Launcher, Preferences, TVInput } from './types';

export const inputVisibilityModes = ['on', 'off', 'auto'] as const;
export const launcherVisibilityModes = ['on', 'off'] as const;
export const MAX_LAUNCHERS = 24;
export const MAX_INPUT_NAME = 40;
// Apps worth a Home card on most LG TVs; shown first when choosing a launcher target.
export const launcherSuggestions = [
  'airplay',
  'com.webos.app.miracast',
  'com.webos.app.btspeakerapp',
  'com.webos.app.homeconnect',
  'com.webos.app.livetv',
];

export function parseInputVisibility(value: unknown): Preferences['inputVisibility'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, mode]) => validAppId(id) && (mode === 'on' || mode === 'off' || mode === 'auto'),
    ),
  );
}

// oxlint-disable-next-line eslint/no-control-regex -- Names come from storage and must stay printable.
const controls = /[\u0000-\u001f\u007f]/g;
export const cleanName = (value: unknown) =>
  typeof value === 'string' ? value.replace(controls, '').trim().slice(0, MAX_INPUT_NAME) : '';

export function parseInputNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, name]) => [id, cleanName(name)] as const)
      .filter(([id, name]) => validAppId(id) && name),
  );
}

export function parseInputIcons(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, ref]) => validAppId(id) && parseIconRef(ref) !== null),
  );
}

export const validLauncherId = (value: unknown): value is string =>
  typeof value === 'string' && /^launcher-[a-z0-9]{6,16}$/.test(value);

export function newLauncherId(): string {
  return `launcher-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
}

export function parseLaunchers(value: unknown): Launcher[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .flatMap((entry): Launcher[] => {
      if (!entry || typeof entry !== 'object') return [];
      const { id, title, icon, target } = entry as Record<string, unknown>;
      if (!validLauncherId(id) || seen.has(id) || !validAppId(target)) return [];
      seen.add(id);
      return [
        {
          id,
          title: cleanName(title) || target,
          icon: parseIconRef(icon) ? (icon as string) : '',
          target,
        },
      ];
    })
    .slice(0, MAX_LAUNCHERS);
}

export function getInputVisibility(
  id: string,
  visibility: Preferences['inputVisibility'],
): InputVisibility {
  return visibility[id] ?? 'auto';
}

// Physical inputs follow on/off/auto (auto = only while connected). Launchers are on unless off.
export function visibleInputs(
  inputs: TVInput[],
  visibility: Preferences['inputVisibility'],
): TVInput[] {
  return inputs.filter((input) => {
    const mode = getInputVisibility(input.id, visibility);
    if (input.kind === 'launcher') return mode !== 'off';
    return mode === 'on' || (mode === 'auto' && input.connected === true);
  });
}

// The user's own names replace the TV label and re-guess the device kind from the new name.
export function applyInputNames(inputs: TVInput[], names: Record<string, string>): TVInput[] {
  return inputs.map((input) => {
    const name = names[input.id];
    return name ? { ...input, title: name, kind: inputKind(name), named: true } : input;
  });
}

export function launcherInputs(launchers: Launcher[], targets: AppTarget[]): TVInput[] {
  return launchers.map((launcher) => ({
    id: launcher.id,
    title: launcher.title,
    port: targets.find((target) => target.id === launcher.target)?.title ?? launcher.target,
    connected: null,
    kind: 'launcher',
    target: launcher.target,
  }));
}

// What a card or settings row shows big: the user's name, the launcher title, or the port.
export const inputHeading = (input: TVInput) =>
  input.kind === 'launcher' || input.named ? input.title : input.port;
