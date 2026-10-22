import { inputKind, validAppId } from './catalog';
import { parseIconRef } from './icnl';
import type {
  AppTarget,
  BuiltinIconName,
  InputVisibility,
  Launcher,
  Preferences,
  TVApp,
  TVInput,
} from './types';

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

export const builtinIconNames: BuiltinIconName[] = [
  'hdmi',
  'console',
  'streamer',
  'computer',
  'usb',
  'playstation',
  'apple-tv',
  'airplay',
  'cast',
  'bluetooth',
  'dashboard',
  'tv',
  'rocket',
];
export const BUILTIN_PREFIX = 'builtin:';
export const validBuiltinIcon = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.startsWith(BUILTIN_PREFIX) &&
  (builtinIconNames as string[]).includes(value.slice(BUILTIN_PREFIX.length));
export const builtinIconName = (choice: string) =>
  choice.slice(BUILTIN_PREFIX.length) as BuiltinIconName;
// An icon choice for inputs and launchers: a pack reference or a built-in symbol.
export const validIconChoice = (value: unknown): value is string =>
  parseIconRef(value) !== null || validBuiltinIcon(value);

export function parseInputIcons(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, ref]) => validAppId(id) && validIconChoice(ref)),
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
      const { id, title, icon, target, placement } = entry as Record<string, unknown>;
      if (!validLauncherId(id) || seen.has(id) || !validAppId(target)) return [];
      seen.add(id);
      return [
        {
          id,
          title: cleanName(title) || target,
          icon: validIconChoice(icon) ? icon : '',
          target,
          placement: placement === 'apps' ? 'apps' : 'inputs',
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

const targetTitle = (targets: AppTarget[], id: string) =>
  targets.find((target) => target.id === id)?.title ?? id;

// Every launcher as a card record (Settings lists them all); Home shows only placement "inputs".
export function launcherInputs(launchers: Launcher[], targets: AppTarget[]): TVInput[] {
  return launchers.map((launcher) => ({
    id: launcher.id,
    title: launcher.title,
    port: targetTitle(targets, launcher.target),
    connected: null,
    kind: 'launcher',
    target: launcher.target,
    placement: launcher.placement,
  }));
}

// Launchers placed as apps join the library as tiles that open their target.
export function launcherApps(launchers: Launcher[], targets: AppTarget[]): TVApp[] {
  return launchers
    .filter((launcher) => launcher.placement === 'apps')
    .map((launcher) => ({
      id: launcher.id,
      title: launcher.title || targetTitle(targets, launcher.target),
      category: 'Utilities',
      brand: 'launcher',
      target: launcher.target,
    }));
}

// What a card or settings row shows big: the user's name, the launcher title, or the port.
export const inputHeading = (input: TVInput) =>
  input.kind === 'launcher' || input.named ? input.title : input.port;
