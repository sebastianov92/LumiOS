import {
  Accessibility,
  Check,
  ChevronRight,
  Clock3,
  Languages,
  MapPin,
  RefreshCw,
  Thermometer,
  Type,
  Zap,
} from 'lucide-react';
import { WeatherSettings } from './weather-settings';
import {
  InputDetail,
  InputSettings,
  LauncherDetail,
  orderTargets,
  TargetPicker,
} from './input-settings';
import {
  AppIconPicker,
  builtinIconOptions,
  IconOptionList,
  IconSettings,
  PackDetail,
  packIconOptions,
  type IconDescription,
} from './icon-settings';
import type {
  AppTarget,
  Language,
  Launcher,
  Preferences,
  ResolvedIcon,
  TVApp,
  TVInput,
} from '../types';
import type { PackLibrary } from '../use-packs';
import type { StoredPack } from '../packs';
import type { SystemPreload } from '../preload';
import { isTV } from '../bridge';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { wallpapers, wallpaperThumbnail } from '../wallpapers';
import { useTranslation, wallpaperLabel } from '../i18n';
import { getInputVisibility, inputHeading, newLauncherId } from '../inputs';
import { findIcon, wallpaperRef } from '../icnl';

const languageOptions = [
  ['en', 'english'],
  ['de', 'german'],
  ['zh', 'chinese'],
  ['es', 'spanish'],
] as const;
const languageNames = Object.fromEntries(languageOptions) as Record<
  Language,
  (typeof languageOptions)[number][1]
>;

type SettingsSection = 'interface' | 'background' | 'weather' | 'inputs' | 'icons';
type SettingsSubpage =
  | 'language'
  | 'weather-location'
  | 'temperature'
  | 'clock-format'
  | 'input'
  | 'input-icon'
  | 'launcher'
  | 'launcher-icon'
  | 'launcher-target'
  | 'add-launcher'
  | 'pack'
  | 'app-icon';

const subpageTitles = {
  language: 'language',
  'weather-location': 'location',
  temperature: 'temperature',
  'clock-format': 'clockFormat',
} as const;

// Match the two-column gallery breakpoint in settings.css without measuring on keypresses.
const galleryLayoutQuery = '(max-width: 600px)';
const getGalleryColumns = () => (window.matchMedia(galleryLayoutQuery).matches ? 2 : 3);
const subscribeGalleryLayout = (onChange: () => void) => {
  const query = window.matchMedia(galleryLayoutQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

interface Props {
  preferences: Preferences;
  inputs: TVInput[];
  inputsLoading: boolean;
  inputsWarning?: string;
  launchers: TVInput[];
  targets: AppTarget[];
  inputIconFor: (input: TVInput) => ResolvedIcon | undefined;
  apps: TVApp[];
  packs: PackLibrary;
  describeIcon: (app: TVApp) => IconDescription;
  onUpdate: (patch: Partial<Preferences>) => void;
  onRefresh: () => void;
  onImportUsb: () => void;
  onReloadPacks: () => void;
  onRemovePack: (pack: StoredPack) => Promise<boolean>;
  onNotify: (message: string) => void;
  systemPreload: SystemPreload;
  onToggleSystemPreload: () => void;
}

export function Settings({
  preferences,
  inputs,
  inputsLoading,
  inputsWarning,
  launchers,
  targets,
  inputIconFor,
  apps,
  packs,
  describeIcon,
  onUpdate,
  onRefresh,
  onImportUsb,
  onReloadPacks,
  onRemovePack,
  onNotify,
  systemPreload,
  onToggleSystemPreload,
}: Props) {
  const { t, language } = useTranslation();
  const galleryColumns = useSyncExternalStore(subscribeGalleryLayout, getGalleryColumns);
  const [section, setSection] = useState<SettingsSection>('interface');
  const [subpage, setSubpage] = useState<SettingsSubpage | null>(null);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const selectedInput = inputs.find((input) => input.id === selectedInputId);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const selectedPack = packs.packs.find((pack) => pack.id === selectedPackId);
  const selectedApp = apps.find((app) => app.id === selectedAppId);
  const [selectedLauncherId, setSelectedLauncherId] = useState<string | null>(null);
  const selectedLauncher = preferences.launchers.find((item) => item.id === selectedLauncherId);
  const selectedLauncherCard = launchers.find((item) => item.id === selectedLauncherId);
  // A child subpage (icon or target picker) returns to its parent subpage on Back.
  const [subpageParent, setSubpageParent] = useState<{
    subpage: SettingsSubpage;
    focus: string;
  } | null>(null);
  const subpageTitle =
    subpage === 'input'
      ? selectedInput
        ? inputHeading(selectedInput)
        : t('inputs')
      : subpage === 'input-icon' || subpage === 'launcher-icon'
        ? t('inputIcon')
        : subpage === 'launcher'
          ? (selectedLauncher?.title ?? t('launcher'))
          : subpage === 'launcher-target' || subpage === 'add-launcher'
            ? t('chooseTarget')
            : subpage === 'pack'
              ? (selectedPack?.name ?? t('iconPacks'))
              : subpage === 'app-icon'
                ? (selectedApp?.title ?? t('appIcons'))
                : subpage
                  ? t(subpageTitles[subpage])
                  : '';
  const [subpageReturnFocus, setSubpageReturnFocus] = useState('setting-language');
  // Built-in backgrounds first, then every pack wallpaper (image or CSS gradient).
  const wallpaperOptions = [
    ...wallpapers.map((wallpaper) => ({
      id: wallpaper.id as string,
      title: wallpaper.title,
      image: wallpaperThumbnail(wallpaper.image),
    })),
    ...packs.packs.flatMap((pack) =>
      pack.wallpapers.map((wallpaper) => {
        const ref = wallpaperRef(pack.id, wallpaper.meta.slug);
        return {
          id: ref,
          title: wallpaper.meta.title,
          image: packs.wallpaperUrls.get(ref) ?? '',
        };
      }),
    ),
  ];
  const currentWallpaper = wallpaperOptions.some((option) => option.id === preferences.wallpaper)
    ? preferences.wallpaper
    : wallpaperOptions[0].id;
  const updateLauncher = (id: string, patch: Partial<Launcher>) =>
    onUpdate({
      launchers: preferences.launchers.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  const packIconTitle = (icon: ResolvedIcon | undefined, fallback: string) =>
    icon?.source === 'pack'
      ? (findIcon(packs.packs, icon.ref)?.icon.meta.title ?? fallback)
      : icon?.source === 'builtin'
        ? (builtinIconOptions(t, [icon.name])[0]?.label ?? fallback)
        : fallback;
  const chooseLanguage = (next: Language) => {
    onUpdate({ language: next });
    setSubpage(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('[data-focusable="setting-language"]')
        ?.focus({ preventScroll: true }),
    );
  };
  const subpageReturnFocusId = (target: SettingsSubpage) => {
    switch (target) {
      case 'language':
        return 'setting-language';
      case 'temperature':
        return 'setting-temperature';
      case 'clock-format':
        return 'setting-clock-format';
      case 'weather-location':
        return 'setting-weather-location';
      case 'input':
        return `setting-input-${selectedInputId}`;
      case 'input-icon':
        return 'input-icon';
      case 'launcher':
        return `setting-launcher-${selectedLauncherId}`;
      case 'launcher-icon':
        return 'launcher-icon';
      case 'launcher-target':
        return 'launcher-target';
      case 'add-launcher':
        return 'setting-add-launcher';
      case 'pack':
        return `setting-pack-${selectedPackId}`;
      case 'app-icon':
        return `setting-app-icon-${selectedAppId}`;
    }
  };
  const openSubpage = (
    next: SettingsSubpage,
    focusable: string,
    returnFocus?: string,
    parent?: { subpage: SettingsSubpage; focus: string },
  ) => {
    setSubpage(next);
    setSubpageParent(parent ?? null);
    if (!parent) setSubpageReturnFocus(returnFocus ?? subpageReturnFocusId(next));
    requestAnimationFrame(() => {
      // Focus the entry option unless input already moved focus into the subpage.
      if (document.activeElement?.closest('[data-settings-subpage]')) return;
      document
        .querySelector<HTMLElement>(`[data-focusable="${focusable}"]`)
        ?.focus({ preventScroll: true });
    });
  };
  const closeSubpage = useCallback(() => {
    const focusable = subpageParent?.focus ?? subpageReturnFocus;
    setSubpage(subpageParent?.subpage ?? null);
    setSubpageParent(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-focusable="${focusable}"]`)
        ?.focus({ preventScroll: true }),
    );
  }, [subpageParent, subpageReturnFocus]);
  const chooseTemperature = (unit: Preferences['temperatureUnit']) => {
    onUpdate({ temperatureUnit: unit });
    setSubpage(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('[data-focusable="setting-temperature"]')
        ?.focus({ preventScroll: true }),
    );
  };
  const chooseClockFormat = (clock24: boolean) => {
    onUpdate({ clock24 });
    setSubpage(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('[data-focusable="setting-clock-format"]')
        ?.focus({ preventScroll: true }),
    );
  };
  useEffect(() => {
    if (!subpage && section !== 'background') return;
    const onBack = (event: KeyboardEvent) => {
      if (
        !subpage &&
        (!(event.target instanceof HTMLElement) || !event.target.closest('.wallpaper-options'))
      )
        return;
      if (event.key === 'ArrowLeft') {
        if (
          !(event.target instanceof HTMLElement) ||
          !event.target.closest('[data-settings-subpage]')
        )
          return;
      } else if (event.key !== 'Escape' && event.keyCode !== 461 && event.key !== 'Backspace')
        return;
      if (event.target instanceof HTMLInputElement && event.key === 'Backspace') return;
      event.preventDefault();
      event.stopPropagation();
      if (!subpage) {
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' });
        document
          .querySelector<HTMLElement>('[data-focusable="settings-section-background"]')
          ?.focus({ preventScroll: true });
        return;
      }
      closeSubpage();
    };
    document.addEventListener('keydown', onBack);
    return () => document.removeEventListener('keydown', onBack);
  }, [section, subpage, closeSubpage]);
  const sectionOrder = ['interface', 'background', 'weather', 'inputs', 'icons'] as const;
  const sectionTitle = (id: (typeof sectionOrder)[number]) => t(id);
  const enterSection = (next: (typeof sectionOrder)[number]) => {
    setSection(next);
    setSubpage(null);
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>(`[data-focusable="${sectionFirst[next]}"]`);
      first?.focus({ preventScroll: true });
    });
  };
  const sectionFirst = {
    interface: 'setting-home-app-names',
    background: `wallpaper-${currentWallpaper}`,
    weather: 'setting-show-weather',
    inputs: inputs[0] ? `setting-input-${inputs[0].id}` : 'setting-inputs-refresh',
    icons: packs.packs[0] ? `setting-pack-${packs.packs[0].id}` : 'setting-icons-usb',
  };
  const sectionNext = {
    interface: 'background',
    background: 'weather',
    weather: 'inputs',
    inputs: 'icons',
    icons: 'interface',
  };
  return (
    <section className="settings-page" aria-label={t('settingsRegion')}>
      <h1 className="sr-only">{t('settings')}</h1>
      <div className="settings-layout">
        <nav className="settings-sidebar" aria-label={t('settingsSections')}>
          {sectionOrder.map((id, index) => (
            <button
              key={id}
              className={`settings-sidebar-item${section === id ? ' selected' : ''}`}
              data-focusable={`settings-section-${id}`}
              tabIndex={section === id ? 0 : -1}
              data-focus-up={index ? `settings-section-${sectionOrder[index - 1]}` : 'nav-settings'}
              data-focus-down={`settings-section-${sectionNext[id]}`}
              data-focus-right={sectionFirst[id]}
              aria-current={section === id ? 'page' : undefined}
              aria-label={
                section === id && subpage ? `${sectionTitle(id)}: ${subpageTitle}` : undefined
              }
              onFocus={() => {
                if (section !== id) {
                  setSection(id);
                }
                setSubpage(null);
              }}
              onClick={() => enterSection(id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  event.stopPropagation();
                  const first = document.querySelector<HTMLElement>(
                    `[data-focusable="${sectionFirst[id]}"]`,
                  );
                  first?.focus({ preventScroll: true });
                  return;
                }
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setSection(id);
                setSubpage(null);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>(`[data-focusable="${sectionFirst[id]}"]`)
                    ?.focus({ preventScroll: true }),
                );
              }}
            >
              {section === id && subpage ? (
                <span className="settings-sidebar-path">
                  <span className="settings-sidebar-parent">{sectionTitle(id)}</span>
                  <ChevronRight className="settings-sidebar-separator" aria-hidden="true" />
                  <span className="settings-sidebar-subpage">{subpageTitle}</span>
                </span>
              ) : (
                <span>{sectionTitle(id)}</span>
              )}
              {section === id && !subpage ? <ChevronRight aria-hidden="true" /> : null}
            </button>
          ))}
        </nav>
        <div
          className="settings-pane"
          data-focus-left={`settings-section-${section}`}
          key={section}
        >
          {!subpage && section === 'background' ? (
            <section className="settings-content" aria-label={t('background')}>
              <div className="wallpaper-options">
                {wallpaperOptions.map((option, index) => (
                  <button
                    key={option.id}
                    className={`wallpaper-option${preferences.wallpaper === option.id ? ' selected' : ''}`}
                    data-focusable={`wallpaper-${option.id}`}
                    data-focus-left={
                      index % galleryColumns === 0
                        ? 'settings-section-background'
                        : `wallpaper-${wallpaperOptions[index - 1].id}`
                    }
                    data-focus-right={`wallpaper-${(wallpaperOptions[index + 1] ?? option).id}`}
                    aria-pressed={preferences.wallpaper === option.id}
                    onClick={() => onUpdate({ wallpaper: option.id })}
                  >
                    <span className="wallpaper-thumbnail">
                      {option.image ? (
                        <img src={option.image} alt="" draggable={false} decoding="async" />
                      ) : null}
                      {preferences.wallpaper === option.id ? (
                        <span className="wallpaper-check">
                          <Check size={18} />
                        </span>
                      ) : null}
                    </span>
                    <span>{wallpaperLabel(language, option.id, option.title)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {!subpage && section === 'interface' ? (
            <section className="settings-content" aria-label={t('interface')}>
              <div className="settings-group">
                <button
                  className="setting-row"
                  role="switch"
                  aria-checked={preferences.showHomeAppNames}
                  data-focusable="setting-home-app-names"
                  data-focus-down="setting-clock-format"
                  onClick={() => onUpdate({ showHomeAppNames: !preferences.showHomeAppNames })}
                >
                  <Type />
                  <span>
                    <strong>{t('showAppNames')}</strong>
                  </span>
                  <span className="setting-state" aria-hidden="true">
                    {t(preferences.showHomeAppNames ? 'stateOn' : 'stateOff')}
                  </span>
                </button>
                <button
                  className="setting-row settings-list-item"
                  data-focusable="setting-clock-format"
                  data-focus-up="setting-home-app-names"
                  data-focus-down="setting-motion"
                  onClick={() =>
                    openSubpage(
                      'clock-format',
                      preferences.clock24 ? 'clock-format-option-24' : 'clock-format-option-12',
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ')
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSubpage(
                      'clock-format',
                      preferences.clock24 ? 'clock-format-option-24' : 'clock-format-option-12',
                    );
                  }}
                >
                  <Clock3 aria-hidden="true" />
                  <span>
                    <strong>{t('clockFormat')}</strong>
                  </span>
                  <span className="setting-value">
                    {t(preferences.clock24 ? 'hour24' : 'hour12')}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
                <button
                  className="setting-row"
                  role="switch"
                  aria-checked={preferences.reducedMotion}
                  data-focusable="setting-motion"
                  data-focus-up="setting-clock-format"
                  data-focus-down="setting-language"
                  onClick={() => onUpdate({ reducedMotion: !preferences.reducedMotion })}
                >
                  <Accessibility />
                  <span>
                    <strong>{t('reducedMotion')}</strong>
                  </span>
                  <span className="setting-state" aria-hidden="true">
                    {t(preferences.reducedMotion ? 'stateOn' : 'stateOff')}
                  </span>
                </button>
                <button
                  className="setting-row settings-list-item"
                  data-focusable="setting-language"
                  data-focus-up="setting-motion"
                  data-focus-down="setting-refresh"
                  onClick={() => openSubpage('language', `language-option-${preferences.language}`)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ')
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSubpage('language', `language-option-${preferences.language}`);
                  }}
                >
                  <Languages aria-hidden="true" />
                  <span>
                    <strong>{t('language')}</strong>
                  </span>
                  <span className="setting-value">{t(languageNames[preferences.language])}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
              <div className="settings-group">
                <button
                  className="setting-row"
                  data-focusable="setting-refresh"
                  data-focus-up="setting-language"
                  data-focus-down="setting-system-preload"
                  onClick={onRefresh}
                >
                  <RefreshCw />
                  <span>
                    <strong>{t('refreshApps')}</strong>
                  </span>
                </button>
              </div>
              <h2 className="settings-group-title">{t('startup')}</h2>
              <div className="settings-group">
                <button
                  className="setting-row"
                  role="switch"
                  aria-checked={systemPreload.enabled}
                  aria-disabled={
                    systemPreload.available !== true || systemPreload.busy || undefined
                  }
                  data-focusable="setting-system-preload"
                  data-focus-up="setting-refresh"
                  onClick={onToggleSystemPreload}
                >
                  <Zap />
                  <span>
                    <strong>{t('systemPreload')}</strong>
                    <small>
                      {systemPreload.available === true
                        ? t('systemPreloadHint')
                        : systemPreload.available === null
                          ? t('systemPreloadWorking')
                          : isTV()
                            ? t('systemPreloadUnavailable')
                            : t('tvOnlyHint')}
                    </small>
                  </span>
                  <span className="setting-state" aria-hidden="true">
                    {t(systemPreload.enabled ? 'stateOn' : 'stateOff')}
                  </span>
                </button>
              </div>
            </section>
          ) : null}
          {!subpage && section === 'weather' ? (
            <section
              className="settings-content settings-weather-content"
              aria-label={t('weather')}
            >
              <WeatherSettings
                location={preferences.weatherLocation}
                onChange={(weatherLocation) => onUpdate({ weatherLocation })}
                enabled={preferences.showWeather}
                onEnabledChange={(showWeather) => onUpdate({ showWeather })}
                unit={preferences.temperatureUnit}
                onUnitChange={(temperatureUnit) => onUpdate({ temperatureUnit })}
                focusUp="settings-section-weather"
                showTemperature={false}
                showLocationSearch={false}
              />
              <div className="settings-group">
                <button
                  className="setting-row settings-list-item"
                  data-focusable="setting-weather-location"
                  data-focus-up="setting-show-weather"
                  data-focus-down="setting-temperature"
                  onClick={() =>
                    openSubpage(
                      'weather-location',
                      'weather-location-query',
                      'setting-weather-location',
                    )
                  }
                  onKeyDown={(event) => {
                    if (!['ArrowRight', 'Enter', ' '].includes(event.key)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSubpage(
                      'weather-location',
                      'weather-location-query',
                      'setting-weather-location',
                    );
                  }}
                >
                  <MapPin aria-hidden="true" />
                  <span>
                    <strong>{t('location')}</strong>
                  </span>
                  {preferences.weatherLocation ? (
                    <span className="setting-value">{preferences.weatherLocation.name}</span>
                  ) : null}
                  <ChevronRight aria-hidden="true" />
                </button>
                <button
                  className="setting-row settings-list-item"
                  data-focusable="setting-temperature"
                  data-focus-up="setting-weather-location"
                  onClick={() =>
                    openSubpage('temperature', `temperature-option-${preferences.temperatureUnit}`)
                  }
                  onKeyDown={(event) => {
                    if (!['ArrowRight', 'Enter', ' '].includes(event.key)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSubpage('temperature', `temperature-option-${preferences.temperatureUnit}`);
                  }}
                >
                  <Thermometer aria-hidden="true" />
                  <span>
                    <strong>{t('temperature')}</strong>
                  </span>
                  <span className="setting-value">
                    {preferences.temperatureUnit === 'celsius' ? '°C' : '°F'}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </section>
          ) : null}
          {!subpage && section === 'inputs' ? (
            <InputSettings
              inputs={inputs}
              launchers={launchers}
              visibility={preferences.inputVisibility}
              loading={inputsLoading}
              warning={inputsWarning}
              iconFor={inputIconFor}
              onRefresh={onRefresh}
              onOpen={(input) => {
                setSelectedInputId(input.id);
                openSubpage(
                  'input',
                  `input-visibility-option-${getInputVisibility(input.id, preferences.inputVisibility)}`,
                  `setting-input-${input.id}`,
                );
              }}
              onOpenLauncher={(launcher) => {
                setSelectedLauncherId(launcher.id);
                openSubpage('launcher', 'launcher-name', `setting-launcher-${launcher.id}`);
              }}
              onAddLauncher={() => {
                const { suggested, rest } = orderTargets(targets);
                const first = suggested[0] ?? rest[0];
                openSubpage(
                  'add-launcher',
                  first ? `target-option-${first.id}` : 'nav-settings',
                  'setting-add-launcher',
                );
              }}
            />
          ) : null}
          {!subpage && section === 'icons' ? (
            <IconSettings
              packs={packs.packs}
              loading={packs.loading}
              apps={apps}
              describe={describeIcon}
              onImportUsb={onImportUsb}
              onReload={onReloadPacks}
              onOpenPack={(pack) => {
                setSelectedPackId(pack.id);
                openSubpage('pack', 'pack-remove', `setting-pack-${pack.id}`);
              }}
              onOpenApp={(app) => {
                setSelectedAppId(app.id);
                openSubpage(
                  'app-icon',
                  `app-icon-option-${preferences.iconOverrides[app.id] ?? 'auto'}`,
                  `setting-app-icon-${app.id}`,
                );
              }}
            />
          ) : null}
          {subpage ? (
            <div
              key={subpage}
              className={`settings-subpage settings-subpage-${subpage}`}
              data-settings-subpage="true"
              role="region"
              aria-label={subpageTitle}
            >
              {subpage === 'language' ? (
                <div className="settings-subpage-options" role="listbox" aria-label={t('language')}>
                  {languageOptions.map(([option, label], index) => (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={preferences.language === option}
                      className="setting-row settings-list-item"
                      data-focusable={`language-option-${option}`}
                      data-focus-up={
                        index ? `language-option-${languageOptions[index - 1][0]}` : 'nav-settings'
                      }
                      data-focus-down={`language-option-${languageOptions[(index + 1) % languageOptions.length][0]}`}
                      onClick={() => chooseLanguage(option)}
                    >
                      <span>
                        <strong>{t(label)}</strong>
                      </span>
                      {preferences.language === option ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              ) : subpage === 'clock-format' ? (
                <div
                  className="settings-subpage-options"
                  role="listbox"
                  aria-label={t('clockFormat')}
                >
                  {(
                    [
                      [false, 'clock-format-option-12', 'hour12'],
                      [true, 'clock-format-option-24', 'hour24'],
                    ] as const
                  ).map(([clock24, focusId, label]) => (
                    <button
                      key={focusId}
                      type="button"
                      role="option"
                      aria-selected={preferences.clock24 === clock24}
                      className="setting-row settings-list-item"
                      data-focusable={focusId}
                      data-focus-up={clock24 ? 'clock-format-option-12' : 'nav-settings'}
                      data-focus-down={
                        clock24 ? 'clock-format-option-12' : 'clock-format-option-24'
                      }
                      onClick={() => chooseClockFormat(clock24)}
                    >
                      <span>
                        <strong>{t(label)}</strong>
                      </span>
                      {preferences.clock24 === clock24 ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              ) : subpage === 'temperature' ? (
                <div
                  className="settings-subpage-options"
                  role="listbox"
                  aria-label={t('temperature')}
                >
                  {(
                    [
                      ['celsius', 'temperature-option-celsius', 'celsius'],
                      ['fahrenheit', 'temperature-option-fahrenheit', 'fahrenheit'],
                    ] as const
                  ).map(([unit, focusId, label]) => (
                    <button
                      key={focusId}
                      type="button"
                      role="option"
                      aria-selected={preferences.temperatureUnit === unit}
                      className="setting-row settings-list-item"
                      data-focusable={focusId}
                      data-focus-up={
                        unit === 'celsius' ? 'nav-settings' : 'temperature-option-celsius'
                      }
                      data-focus-down={
                        unit === 'celsius'
                          ? 'temperature-option-fahrenheit'
                          : 'temperature-option-celsius'
                      }
                      onClick={() => chooseTemperature(unit)}
                    >
                      <span>
                        <strong>{t(label)}</strong>
                      </span>
                      {preferences.temperatureUnit === unit ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              ) : subpage === 'input' && selectedInput ? (
                <InputDetail
                  input={selectedInput}
                  name={preferences.inputNames[selectedInput.id] ?? ''}
                  visibility={getInputVisibility(selectedInput.id, preferences.inputVisibility)}
                  icon={inputIconFor(selectedInput)}
                  iconLabel={packIconTitle(inputIconFor(selectedInput), t('iconAuto'))}
                  onName={(name) => {
                    const inputNames = { ...preferences.inputNames };
                    if (name) inputNames[selectedInput.id] = name;
                    else delete inputNames[selectedInput.id];
                    onUpdate({ inputNames });
                  }}
                  onOpenIcon={() =>
                    openSubpage(
                      'input-icon',
                      `input-icon-option-${preferences.inputIcons[selectedInput.id] ?? 'auto'}`,
                      undefined,
                      { subpage: 'input', focus: 'input-icon' },
                    )
                  }
                  onVisibility={(mode) => {
                    onUpdate({
                      inputVisibility: { ...preferences.inputVisibility, [selectedInput.id]: mode },
                    });
                    closeSubpage();
                  }}
                />
              ) : subpage === 'input-icon' && selectedInput ? (
                <IconOptionList
                  prefix="input-icon-option"
                  label={t('inputIcon')}
                  options={[
                    { id: 'auto', label: t('iconAuto') },
                    ...builtinIconOptions(t),
                    ...packIconOptions(packs.packs, packs.urls, ['glyph', 'tile']),
                  ]}
                  selected={preferences.inputIcons[selectedInput.id] ?? 'auto'}
                  onChange={(id) => {
                    const inputIcons = { ...preferences.inputIcons };
                    if (id === 'auto') delete inputIcons[selectedInput.id];
                    else inputIcons[selectedInput.id] = id;
                    onUpdate({ inputIcons });
                    closeSubpage();
                  }}
                />
              ) : subpage === 'launcher' && selectedLauncher && selectedLauncherCard ? (
                <LauncherDetail
                  launcher={selectedLauncherCard}
                  placement={selectedLauncher.placement}
                  onPlacement={(placement) => updateLauncher(selectedLauncher.id, { placement })}
                  visibility={
                    getInputVisibility(selectedLauncher.id, preferences.inputVisibility) === 'off'
                      ? 'off'
                      : 'on'
                  }
                  icon={inputIconFor(selectedLauncherCard)}
                  iconLabel={packIconTitle(inputIconFor(selectedLauncherCard), t('iconDefault'))}
                  onName={(title) => updateLauncher(selectedLauncher.id, { title })}
                  onOpenIcon={() =>
                    openSubpage(
                      'launcher-icon',
                      `launcher-icon-option-${selectedLauncher.icon || 'default'}`,
                      undefined,
                      { subpage: 'launcher', focus: 'launcher-icon' },
                    )
                  }
                  onOpenTarget={() =>
                    openSubpage(
                      'launcher-target',
                      `target-option-${selectedLauncher.target}`,
                      undefined,
                      { subpage: 'launcher', focus: 'launcher-target' },
                    )
                  }
                  onVisibility={(mode) => {
                    onUpdate({
                      inputVisibility: {
                        ...preferences.inputVisibility,
                        [selectedLauncher.id]: mode,
                      },
                    });
                    closeSubpage();
                  }}
                  onDelete={() => {
                    onUpdate({
                      launchers: preferences.launchers.filter(
                        (item) => item.id !== selectedLauncher.id,
                      ),
                    });
                    onNotify(t('launcherDeleted', { name: selectedLauncher.title }));
                    setSubpage(null);
                    setSubpageParent(null);
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>('[data-focusable="setting-add-launcher"]')
                        ?.focus({ preventScroll: true }),
                    );
                  }}
                />
              ) : subpage === 'launcher-icon' && selectedLauncher ? (
                <IconOptionList
                  prefix="launcher-icon-option"
                  label={t('inputIcon')}
                  options={[
                    { id: 'default', label: t('iconDefault') },
                    ...builtinIconOptions(t),
                    ...packIconOptions(packs.packs, packs.urls, ['glyph', 'tile']),
                  ]}
                  selected={selectedLauncher.icon || 'default'}
                  onChange={(id) => {
                    updateLauncher(selectedLauncher.id, { icon: id === 'default' ? '' : id });
                    closeSubpage();
                  }}
                />
              ) : subpage === 'launcher-target' && selectedLauncher ? (
                <TargetPicker
                  targets={targets}
                  selected={selectedLauncher.target}
                  onChange={(target) => {
                    updateLauncher(selectedLauncher.id, { target: target.id });
                    closeSubpage();
                  }}
                />
              ) : subpage === 'add-launcher' ? (
                <TargetPicker
                  targets={targets}
                  onChange={(target) => {
                    const launcher: Launcher = {
                      id: newLauncherId(),
                      title: target.title,
                      icon: '',
                      target: target.id,
                      placement: 'inputs',
                    };
                    onUpdate({ launchers: [...preferences.launchers, launcher] });
                    onNotify(t('launcherAdded', { name: launcher.title }));
                    setSelectedLauncherId(launcher.id);
                    openSubpage('launcher', 'launcher-name', `setting-launcher-${launcher.id}`);
                  }}
                />
              ) : subpage === 'pack' && selectedPack ? (
                <PackDetail
                  pack={selectedPack}
                  onRemove={() => {
                    void onRemovePack(selectedPack).then((removed) => {
                      if (!removed) return;
                      setSubpage(null);
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLElement>('[data-focusable="settings-section-icons"]')
                          ?.focus({ preventScroll: true }),
                      );
                    });
                  }}
                />
              ) : subpage === 'app-icon' && selectedApp ? (
                <AppIconPicker
                  app={selectedApp}
                  packs={packs.packs}
                  urls={packs.urls}
                  value={preferences.iconOverrides[selectedApp.id]}
                  onChange={(next) => {
                    const iconOverrides = { ...preferences.iconOverrides };
                    if (next) iconOverrides[selectedApp.id] = next;
                    else delete iconOverrides[selectedApp.id];
                    onUpdate({ iconOverrides });
                    closeSubpage();
                  }}
                />
              ) : subpage === 'weather-location' ? (
                <section className="settings-weather-subpage" aria-label={t('weather')}>
                  <WeatherSettings
                    location={preferences.weatherLocation}
                    onChange={(weatherLocation) => onUpdate({ weatherLocation })}
                    enabled={preferences.showWeather}
                    onEnabledChange={(showWeather) => onUpdate({ showWeather })}
                    unit={preferences.temperatureUnit}
                    onUnitChange={(temperatureUnit) => onUpdate({ temperatureUnit })}
                    focusUp="nav-settings"
                    showControls={false}
                    showTemperature={false}
                    showLocationSearch
                  />
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
