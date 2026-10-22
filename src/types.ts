import type { IconKind } from './icnl';

export type Page = 'home' | 'apps' | 'settings';
export type Wallpaper =
  | 'dunes'
  | 'san-francisco'
  | 'midnight'
  | 'summit'
  | 'slate'
  | 'forest'
  | 'prism'
  | 'yosemite'
  | 'northern-lights';
export type Category = 'Streaming' | 'Music' | 'Gaming' | 'Utilities';
export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type Language = 'en' | 'de' | 'zh' | 'es';
export type InputVisibility = 'on' | 'off' | 'auto';

export interface TVApp {
  id: string;
  title: string;
  category: Category;
  brand: string;
  // Absolute path of the app's own icon on the TV, when the inventory reports one.
  iconPath?: string;
  // Launcher tiles open this app id instead of their own.
  target?: string;
}

export interface TVIcon {
  url: string;
  color: string;
}

// What a tile finally shows: an icon-pack entry (styled by its pack CSS via data-icnl) or the
// app's own TV icon with a computed background colour.
export type ResolvedIcon =
  | { source: 'pack'; url: string; ref: string; kind: IconKind }
  | { source: 'tv'; url: string; color: string }
  | { source: 'builtin'; name: BuiltinIconName };

// Symbols LumiOS draws itself, selectable for inputs and launchers without any pack.
export type BuiltinIconName =
  | 'hdmi'
  | 'console'
  | 'streamer'
  | 'computer'
  | 'usb'
  | 'playstation'
  | 'apple-tv'
  | 'airplay'
  | 'cast'
  | 'bluetooth'
  | 'dashboard'
  | 'tv'
  | 'rocket';

export interface TVInput {
  id: string;
  title: string;
  port: string;
  connected: boolean | null;
  kind: 'console' | 'streamer' | 'computer' | 'hdmi' | 'launcher';
  // Launcher cards open this app id instead of the card's own id.
  target?: string;
  // True when title comes from the user's own name for the input.
  named?: boolean;
  placement?: 'inputs' | 'apps';
}

// A Home card that opens any app on the TV (AirPlay, Screen Share, …).
export interface Launcher {
  id: string;
  title: string;
  // "pack/slug" or "builtin:<name>", or empty for the default symbol.
  icon: string;
  target: string;
  // Home card in the Inputs row, or a tile in the Apps library.
  placement: 'inputs' | 'apps';
}

// Any app the TV can launch, including ones hidden from the library.
export interface AppTarget {
  id: string;
  title: string;
}

export interface Preferences {
  version: 1;
  favorites: string[] | null;
  hidden: string[];
  recent: string[];
  // A built-in wallpaper id, or a pack wallpaper reference "pack/slug".
  wallpaper: string;
  reducedMotion: boolean;
  clock24: boolean;
  showHomeAppNames: boolean;
  showWeather: boolean;
  temperatureUnit: TemperatureUnit;
  language: Language;
  weatherLocation: WeatherLocation | null;
  inputVisibility: Record<string, InputVisibility>;
  // App id → "pack/slug" icon reference, or "tv" to bypass packs for that app.
  iconOverrides: Record<string, string>;
  inputNames: Record<string, string>;
  inputIcons: Record<string, string>;
  launchers: Launcher[];
}

export interface WeatherLocation {
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface WeatherReading {
  // API readings and cached temperatures are always Celsius.
  temperature: number;
  code: number;
  isDay: boolean;
}

export interface Inventory {
  apps: TVApp[];
  inputs: TVInput[];
  targets: AppTarget[];
  warnings: string[];
}

export interface NativeBridge {
  onservicecallback: (raw: string) => void;
  call(uri: string, payload: string): void;
  cancel(): void;
}

declare global {
  interface Window {
    PalmServiceBridge?: new () => NativeBridge;
    webOSServiceBridge?: new () => NativeBridge;
    PalmSystem?: { identifier?: string; platformBack?: () => void };
    webOSSystem?: { identifier?: string; platformBack?: () => void };
  }
}
