import type { Language, Preferences } from './types';
import { parseLocation } from './weather';
import { wallpapers } from './wallpapers';
import { parseInputIcons, parseInputNames, parseInputVisibility, parseLaunchers } from './inputs';
import { validAppId } from './catalog';
import { validIconOverride } from './icnl';

export const languages: readonly Language[] = ['en', 'de', 'zh', 'es'];

// First run follows the TV's UI language when LumiOS speaks it; English otherwise.
export function detectLanguage(tag?: string): Language {
  const source = tag ?? (typeof navigator !== 'undefined' ? navigator.language : '');
  const code = (typeof source === 'string' ? source : '').toLowerCase().slice(0, 2) as Language;
  return languages.includes(code) ? code : 'en';
}

export const STORAGE_KEY = 'lumios.preferences.v1';
export const defaults: Preferences = {
  version: 1,
  favorites: null,
  hidden: [],
  recent: [],
  wallpaper: 'dunes',
  reducedMotion: false,
  clock24: false,
  showHomeAppNames: false,
  showWeather: true,
  temperatureUnit: 'celsius',
  language: detectLanguage(),
  weatherLocation: null,
  inputVisibility: {},
  iconOverrides: {},
  inputNames: {},
  inputIcons: {},
  launchers: [],
};

export function parseIconOverrides(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, ref]) => validAppId(id) && validIconOverride(ref)),
  );
}

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string => typeof id === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(id),
          ),
        ),
      ].slice(0, 1000)
    : [];

export function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || value.version !== 1) return { ...defaults };
    return {
      version: 1,
      favorites: !Array.isArray(value.favorites) ? null : ids(value.favorites),
      hidden: ids(value.hidden),
      recent: ids(value.recent).slice(0, 12),
      wallpaper: wallpapers.some((wallpaper) => wallpaper.id === value.wallpaper)
        ? value.wallpaper
        : 'dunes',
      reducedMotion: value.reducedMotion === true,
      clock24: value.clock24 === true,
      showHomeAppNames: value.showHomeAppNames === true,
      showWeather: value.showWeather !== false,
      temperatureUnit: value.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      language: languages.includes(value.language) ? value.language : defaults.language,
      weatherLocation: parseLocation(value.weatherLocation),
      inputVisibility: parseInputVisibility(value.inputVisibility),
      iconOverrides: parseIconOverrides(value.iconOverrides),
      inputNames: parseInputNames(value.inputNames),
      inputIcons: parseInputIcons(value.inputIcons),
      launchers: parseLaunchers(value.launchers),
    };
  } catch {
    return { ...defaults };
  }
}

export function loadPreferences(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(value: Preferences): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
