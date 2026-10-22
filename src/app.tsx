import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  ArrowRight,
  CircleAlert,
  Grid2X2,
  Heart,
  LoaderCircle,
  MoreHorizontal,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { AppTile } from './components/app-tile';
import { LiveSpots } from './components/live-wallpaper';
import { InputCard } from './components/input-card';
import { Settings } from './components/settings';
import { AppOptions } from './components/app-options';
import { Weather } from './components/weather';
import { Clock, Greeting } from './components/clock';
import { Navigation } from './components/navigation';
import { defaultFavorites, sortApps } from './catalog';
import { isTV, launchApp, loadInventory, platformBack } from './bridge';
import { moveFocus, type Direction } from './navigation';
import { loadPreferences, savePreferences } from './storage';
import { wallpapers } from './wallpapers';
import { moveFavorite } from './favorites';
import {
  applyInputNames,
  builtinIconName,
  launcherApps,
  launcherInputs,
  validBuiltinIcon,
  visibleInputs,
} from './inputs';
import { useTVIcons } from './use-tv-icons';
import { usePacks } from './use-packs';
import { findIcon, findWallpaper, iconRef, resolveAppIcon, resolveInputIcon } from './icnl';
import { useSystemPreload } from './preload';
import type { IconDescription } from './components/icon-settings';
import type { Category, Inventory, Page, Preferences, ResolvedIcon, TVApp, TVInput } from './types';
import { categoryLabel, LanguageProvider, useTranslation } from './i18n';

const categories: Category[] = ['Streaming', 'Music', 'Gaming', 'Utilities'];
const focusFirstApp = () =>
  (
    document.querySelector<HTMLElement>('main [data-app-id]') ??
    document.querySelector<HTMLElement>('main [data-focusable]')
  )?.focus({ preventScroll: true });

export function App() {
  const [preferences, setPreferences] = useState(loadPreferences);
  return (
    <LanguageProvider language={preferences.language}>
      <Launcher preferences={preferences} setPreferences={setPreferences} />
    </LanguageProvider>
  );
}

function Launcher({
  preferences,
  setPreferences,
}: {
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
}) {
  const { t, language } = useTranslation();
  const [page, setPage] = useState<Page>('home');
  const [inventory, setInventory] = useState<Inventory>({
    apps: [],
    inputs: [],
    targets: [],
    warnings: [],
  });
  const tvIcons = useTVIcons(inventory.apps);
  const packs = usePacks();
  const systemPreload = useSystemPreload();
  // Launchers shown as app tiles join the library; the rest stay cards in the Inputs row.
  const apps = useMemo(
    () => [...inventory.apps, ...launcherApps(preferences.launchers, inventory.targets)],
    [inventory.apps, preferences.launchers, inventory.targets],
  );
  // Icon priority per app: pack entry (override, exact id, match) → TV icon → built-in brand.
  const resolvedIcons = useMemo(() => {
    const map = new Map<string, IconDescription>();
    for (const app of apps) {
      const launcher = app.target
        ? preferences.launchers.find((item) => item.id === app.id)
        : undefined;
      if (!preferences.iconOverrides[app.id] && launcher && validBuiltinIcon(launcher.icon)) {
        map.set(app.id, {
          icon: { source: 'builtin', name: builtinIconName(launcher.icon) },
          source: 'builtin',
        });
        continue;
      }
      const hit =
        resolveAppIcon(app, packs.packs, preferences.iconOverrides) ??
        (launcher?.icon && !validBuiltinIcon(launcher.icon)
          ? findIcon(packs.packs, launcher.icon)
          : undefined);
      const ref = hit ? iconRef(hit.pack.id, hit.icon.meta.slug) : '';
      const url = ref ? packs.urls.get(ref) : undefined;
      const tv = tvIcons[app.id];
      if (hit && url)
        map.set(app.id, {
          icon: { source: 'pack', url, ref, kind: hit.icon.meta.kind },
          source: 'pack',
          packName: hit.pack.name,
        });
      else if (tv)
        map.set(app.id, { icon: { source: 'tv', url: tv.url, color: tv.color }, source: 'tv' });
      else map.set(app.id, { source: app.brand === 'generic' ? 'generic' : 'builtin' });
    }
    return map;
  }, [apps, preferences.launchers, packs.packs, packs.urls, preferences.iconOverrides, tvIcons]);
  const describeIcon = useCallback(
    (app: TVApp): IconDescription => resolvedIcons.get(app.id) ?? { source: 'generic' },
    [resolvedIcons],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [optionsApp, setOptionsApp] = useState<TVApp | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const pendingLaunch = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reloadVersion = useRef(0);
  const lastReordering = useRef<string | null>(null);
  const refreshing = useRef(false);
  const reducedMotion = preferences.reducedMotion;
  const appMap = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const favoriteIds = useMemo(
    () => preferences.favorites ?? defaultFavorites(apps),
    [preferences.favorites, apps],
  );
  const hiddenIds = useMemo(() => new Set(preferences.hidden), [preferences.hidden]);
  const favorites = useMemo(
    () =>
      favoriteIds.flatMap((id) => {
        const app = appMap.get(id);
        return app && !hiddenIds.has(id) ? [app] : [];
      }),
    [favoriteIds, appMap, hiddenIds],
  );
  const inputs = useMemo(
    () => applyInputNames(inventory.inputs, preferences.inputNames),
    [inventory.inputs, preferences.inputNames],
  );
  const launcherCards = useMemo(
    () => launcherInputs(preferences.launchers, inventory.targets),
    [preferences.launchers, inventory.targets],
  );
  const homeInputs = useMemo(
    () => [
      ...visibleInputs(inputs, preferences.inputVisibility),
      ...visibleInputs(
        launcherCards.filter((card) => card.placement !== 'apps'),
        preferences.inputVisibility,
      ),
    ],
    [inputs, launcherCards, preferences.inputVisibility],
  );
  // Pack icons for input cards: the user's pick or a pack entry listing the input; launchers
  // carry their own icon reference.
  const inputIcons = useMemo(() => {
    const map = new Map<string, ResolvedIcon>();
    const add = (id: string, hit: ReturnType<typeof findIcon>) => {
      if (!hit) return;
      const ref = iconRef(hit.pack.id, hit.icon.meta.slug);
      const url = packs.urls.get(ref);
      if (url) map.set(id, { source: 'pack', url, ref, kind: hit.icon.meta.kind });
    };
    const choose = (id: string, choice: string | undefined, fallback: () => void) => {
      if (validBuiltinIcon(choice))
        map.set(id, { source: 'builtin', name: builtinIconName(choice) });
      else fallback();
    };
    for (const input of inputs)
      choose(input.id, preferences.inputIcons[input.id], () =>
        add(input.id, resolveInputIcon(input.id, packs.packs, preferences.inputIcons)),
      );
    for (const launcher of preferences.launchers)
      choose(launcher.id, launcher.icon, () => {
        if (launcher.icon) add(launcher.id, findIcon(packs.packs, launcher.icon));
      });
    return map;
  }, [inputs, preferences.launchers, preferences.inputIcons, packs.packs, packs.urls]);
  const inputIconFor = useCallback((input: TVInput) => inputIcons.get(input.id), [inputIcons]);
  const hiddenCount = useMemo(
    () => apps.filter((app) => hiddenIds.has(app.id)).length,
    [apps, hiddenIds],
  );
  const filteredApps = useMemo(() => {
    if (page !== 'apps') return [];
    const search = query.toLocaleLowerCase();
    return sortApps(
      apps.filter(
        (app) =>
          hiddenIds.has(app.id) === showHidden &&
          (!category || app.category === category) &&
          app.title.toLocaleLowerCase().includes(search),
      ),
      favoriteIds,
    );
  }, [page, apps, hiddenIds, showHidden, category, query, favoriteIds]);

  const notify = useCallback((text: string, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error: isError });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const update = useCallback(
    (patch: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...patch })),
    [setPreferences],
  );

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    const version = ++reloadVersion.current;
    setLoading(true);
    setError('');
    try {
      const next = await loadInventory();
      if (version === reloadVersion.current)
        setInventory((current) => ({
          ...next,
          inputs: next.warnings.length ? current.inputs : next.inputs,
        }));
    } catch (error) {
      if (version === reloadVersion.current)
        setError(error instanceof Error ? error.message : t('tvUnreachable'));
    } finally {
      refreshing.current = false;
      if (version === reloadVersion.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize with the external TV inventory on mount.
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!savePreferences(preferences)) {
      // oxlint-disable-next-line react/set-state-in-effect -- Report a failed external storage write, not derived UI state.
      notify(t('savedError'), true);
    }
  }, [preferences, notify, t]);
  useEffect(() => {
    const resume = () => {
      if (!document.hidden) {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('webOSRelaunch', resume);
    return () => {
      clearTimeout(toastTimer.current);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('webOSRelaunch', resume);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    if (!loading && document.activeElement === document.body) focusFirstApp();
  }, [loading, page]);

  useLayoutEffect(() => {
    const id = reordering ?? lastReordering.current;
    if (id) {
      const card = [
        ...document.querySelectorAll<HTMLElement>('.favorites-grid [data-app-id]'),
      ].find((node) => node.dataset.appId === id);
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
    lastReordering.current = reordering;
  }, [reordering, preferences.favorites]);

  const openPage = useCallback((next: Page) => {
    setReordering(null);
    setPage(next);
    setQuery('');
    setCategory(null);
    setShowHidden(false);
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, []);

  const onLaunch = useCallback(
    async (app: TVApp | TVInput) => {
      if (pendingLaunch.current || reordering) return;
      if (!isTV()) {
        notify(t('desktopPreview', { app: app.title }));
        return;
      }
      pendingLaunch.current = true;
      setLaunching(app.id);
      try {
        await launchApp('target' in app && app.target ? app.target : app.id);
        if (!('port' in app))
          setPreferences((current) => ({
            ...current,
            recent: [app.id, ...current.recent.filter((id) => id !== app.id)].slice(0, 12),
          }));
      } catch (error) {
        notify(error instanceof Error ? error.message : t('appOpenError'), true);
      } finally {
        pendingLaunch.current = false;
        setLaunching(null);
      }
    },
    [notify, reordering, setPreferences, t],
  );

  const onOptions = useCallback(
    (app: TVApp) => {
      if (!reordering) setOptionsApp(app);
    },
    [reordering],
  );
  const startReordering = useCallback((app: TVApp) => setReordering(app.id), []);
  const shiftFavorite = useCallback(
    (id: string, direction: -1 | 1) => {
      setPreferences((current) => {
        const ids = current.favorites ?? defaultFavorites(apps);
        const visible = new Set(
          apps.filter((app) => !current.hidden.includes(app.id)).map((app) => app.id),
        );
        const next = moveFavorite(ids, id, direction, visible);
        return next === ids ? current : { ...current, favorites: next };
      });
    },
    [apps, setPreferences],
  );

  const actions = useRef<{
    back: () => void;
    options: () => void;
    hold: () => void;
    reorder: (key: string) => boolean;
  }>({
    back: () => {},
    options: () => {},
    hold: () => {},
    reorder: () => false,
  });
  useLayoutEffect(() => {
    actions.current = {
      back: () => {
        if (reordering) {
          setReordering(null);
          return;
        }
        if (optionsApp) {
          setOptionsApp(null);
          return;
        }
        if (
          page === 'settings' &&
          document.activeElement?.getAttribute('data-focusable')?.startsWith('settings-section-')
        ) {
          document
            .querySelector<HTMLElement>('[data-focusable="nav-settings"]')
            ?.focus({ preventScroll: true });
          return;
        }
        if (page === 'apps' && document.activeElement?.closest('.library-toolbar .search-field')) {
          setQuery('');
          document
            .querySelector<HTMLElement>('[data-focusable="nav-apps"]')
            ?.focus({ preventScroll: true });
          return;
        }
        if (query) {
          setQuery('');
          return;
        }
        if (page !== 'home') {
          openPage('home');
          requestAnimationFrame(focusFirstApp);
          return;
        }
        platformBack();
      },
      options: () => {
        const id = (document.activeElement as HTMLElement | null)?.dataset.appId;
        if (!optionsApp && id && appMap.has(id)) onOptions(appMap.get(id)!);
      },
      hold: () => {
        const node = document.activeElement as HTMLElement | null;
        const app = node?.dataset.appId ? appMap.get(node.dataset.appId) : undefined;
        if (!app || optionsApp) return;
        if (page === 'home' && node?.dataset.focusable?.startsWith('favorite-'))
          startReordering(app);
        else onOptions(app);
      },
      reorder: (key) => {
        if (!reordering) return false;
        if (key === 'ArrowLeft' || key === 'ArrowRight')
          shiftFavorite(reordering, key === 'ArrowLeft' ? -1 : 1);
        return true;
      },
    };
  });

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let pressed: HTMLElement | null = null;
    let held = false;
    const directions: Record<string, Direction> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const onDown = (event: KeyboardEvent) => {
      const editable = event.target instanceof HTMLInputElement;
      if (
        event.key === 'Escape' ||
        event.keyCode === 461 ||
        (!editable && event.key === 'Backspace')
      ) {
        event.preventDefault();
        if (!event.repeat) actions.current.back();
        return;
      }
      if (actions.current.reorder(event.key)) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Tab') {
        const scope = document.querySelector('[data-focus-scope="dialog"]');
        if (scope) {
          const nodes = [
            ...scope.querySelectorAll<HTMLElement>('[data-focusable]:not([disabled])'),
          ].filter((node) => node.getClientRects().length);
          const index = nodes.indexOf(document.activeElement as HTMLElement);
          if ((!event.shiftKey && index === nodes.length - 1) || (event.shiftKey && index <= 0)) {
            event.preventDefault();
            nodes[event.shiftKey ? nodes.length - 1 : 0]?.focus();
          }
        }
        return;
      }
      const languageOption = (event.target as HTMLElement | null)?.dataset.focusable?.startsWith(
        'language-option-',
      );
      if (
        editable &&
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'ArrowLeft'
      )
        return;
      if (languageOption && event.key.startsWith('Arrow')) {
        event.preventDefault();
        moveFocus(directions[event.key]);
        return;
      }
      if (directions[event.key]) {
        event.preventDefault();
        moveFocus(directions[event.key]);
        return;
      }
      if (event.key === 'ContextMenu' || event.keyCode === 457 || event.key.toLowerCase() === 'm') {
        event.preventDefault();
        actions.current.options();
        return;
      }
      if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        if (event.repeat || pressed) return;
        pressed = document.activeElement as HTMLElement;
        pressed?.setAttribute('data-pressed', 'true');
        held = false;
        if (pressed?.dataset.appId)
          holdTimer = setTimeout(() => {
            held = true;
            pressed?.removeAttribute('data-pressed');
            actions.current.hold();
          }, 600);
      }
    };
    const release = (event?: KeyboardEvent) => {
      if (event && event.key !== 'Enter' && event.keyCode !== 13) return;
      clearTimeout(holdTimer);
      const target = pressed;
      pressed = null;
      target?.removeAttribute('data-pressed');
      if (event && target && !held && target === document.activeElement) {
        event.preventDefault();
        target.click();
      }
      held = false;
    };
    const onBlur = () => release();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', onBlur);
    return () => {
      clearTimeout(holdTimer);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const renderTile = (app: TVApp, prefix: string, pinned = false) => (
    <AppTile
      key={app.id}
      app={app}
      prefix={prefix}
      icon={resolvedIcons.get(app.id)?.icon}
      pinned={pinned}
      launching={launching === app.id}
      reordering={prefix === 'favorite' && reordering === app.id}
      onLaunch={onLaunch}
      onOptions={onOptions}
      onHold={prefix === 'favorite' ? startReordering : undefined}
    />
  );
  const packWallpaper = findWallpaper(packs.packs, preferences.wallpaper);
  const wallpaper =
    wallpapers.find((item) => item.id === preferences.wallpaper) ??
    wallpapers.find((item) => item.id === 'dunes') ??
    wallpapers[0];
  const pageEntryFocus: Record<Page, string> = {
    home: favorites[0]
      ? `favorite-${favorites[0].id}`
      : error && !inventory.apps.length
        ? 'retry'
        : 'browse-apps',
    apps: filteredApps[0] ? `library-${filteredApps[0].id}` : 'filter-Streaming',
    settings: 'settings-section-interface',
  };

  return (
    <div className={`lumios${reducedMotion ? ' reduce-motion' : ''}`}>
      <div className="landscape-fallback" />
      <div
        className={`wallpaper ${packWallpaper ? 'wallpaper-pack' : `wallpaper-${wallpaper.id}`}${!packWallpaper && wallpaper.spots ? ' wallpaper-live' : ''}`}
        data-wallpaper={packWallpaper ? preferences.wallpaper : undefined}
        style={
          packWallpaper
            ? packWallpaper.wallpaper.type
              ? {
                  backgroundImage: `url('${packs.wallpaperUrls.get(preferences.wallpaper) ?? ''}')`,
                }
              : undefined
            : wallpaper.spots
              ? { background: wallpaper.base }
              : { backgroundImage: `url('./wallpapers/${wallpaper.image}')` }
        }
      >
        {!packWallpaper && wallpaper.spots ? <LiveSpots spots={wallpaper.spots} /> : null}
      </div>
      <div className="wallpaper-shade" />
      <div className="shell">
        <header className="header" data-focus-down={pageEntryFocus[page]}>
          <Clock clock24={preferences.clock24} language={language} />
          <Navigation page={page} onChange={openPage} />
          <div className="header-right">
            <button
              className="icon-button settings-button"
              data-focusable="tv-settings"
              aria-label={t('tvSettings')}
              title={t('tvSettings')}
              onClick={() =>
                void onLaunch({
                  id: 'com.palm.app.settings',
                  title: 'TV settings',
                  category: 'Utilities',
                  brand: 'settings',
                })
              }
            >
              <Settings2 strokeWidth={1.8} />
            </button>
          </div>
        </header>
        <main className={`main page-${page}`} data-focus-exit-up={`nav-${page}`}>
          {page === 'home' ? (
            <>
              <section className="hero" aria-labelledby="greeting">
                <div className="hero-copy">
                  <Greeting language={language} />
                  {preferences.showWeather ? (
                    <Weather
                      location={preferences.weatherLocation}
                      unit={preferences.temperatureUnit}
                      onConfigure={() => {
                        openPage('settings');
                        requestAnimationFrame(() => {
                          const section = document.querySelector<HTMLElement>(
                            '[data-focusable="settings-section-weather"]',
                          );
                          section?.focus({ preventScroll: true });
                          section?.click();
                          requestAnimationFrame(() => {
                            const location = document.querySelector<HTMLElement>(
                              '[data-focusable="setting-weather-location"]',
                            );
                            location?.focus({ preventScroll: true });
                            location?.click();
                            requestAnimationFrame(() => {
                              const field = document.querySelector<HTMLElement>(
                                '[data-focusable="weather-location-query"]',
                              );
                              field?.focus({ preventScroll: true });
                              field?.scrollIntoView({ block: 'nearest' });
                            });
                          });
                        });
                      }}
                    />
                  ) : null}
                </div>
              </section>
              <section className="favorites-section" aria-labelledby="favorites-heading">
                <div className="section-heading">
                  <h2 id="favorites-heading">{t('favorites')}</h2>
                  {reordering ? (
                    <span className="reorder-status" role="status">
                      {t('moveApps')}
                    </span>
                  ) : null}
                </div>
                {loading && !inventory.apps.length ? (
                  <div className="app-grid skeleton-grid" aria-label={t('findingApps')}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <div className="skeleton" key={index} />
                    ))}
                  </div>
                ) : error && !inventory.apps.length ? (
                  <div className="empty-state">
                    <CircleAlert />
                    <h3>{t('aLittleHelp')}</h3>
                    <p>{error}</p>
                    <button
                      className="primary-button"
                      data-focusable="retry"
                      onClick={() => void refresh()}
                    >
                      {t('retry')} <ArrowRight size={18} />
                    </button>
                  </div>
                ) : favorites.length ? (
                  <div
                    className={`app-grid favorites-grid${preferences.showHomeAppNames ? '' : ' hide-app-labels'}${reordering ? ' is-reordering' : ''}`}
                  >
                    {favorites.map((app) => renderTile(app, 'favorite'))}
                  </div>
                ) : (
                  <div className="empty-state empty-favorites">
                    <Heart />
                    <h3>{t('makeFavorites')}</h3>
                    <p>{t('pinHint')}</p>
                    <button
                      className="primary-button"
                      data-focusable="browse-apps"
                      onClick={() => openPage('apps')}
                    >
                      {t('exploreApps')} <ArrowRight size={18} />
                    </button>
                  </div>
                )}
              </section>
              {homeInputs.length ? (
                <section className="home-inputs" aria-labelledby="inputs-heading">
                  <div className="section-heading">
                    <h2 id="inputs-heading">{t('inputsHeading')}</h2>
                  </div>
                  <div className="input-grid home-input-grid">
                    {homeInputs.map((input) => (
                      <InputCard
                        key={input.id}
                        input={input}
                        icon={inputIcons.get(input.id)}
                        onLaunch={onLaunch}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
          {page === 'apps' ? (
            <>
              <h1 className="sr-only">{t('apps')}</h1>
              <div className="library-toolbar" data-focus-scroll-top="true">
                <div className="filter-tabs" aria-label={t('appCategories')}>
                  {categories.map((item) => (
                    <button
                      key={item}
                      className={`filter-tab${category === item ? ' selected' : ''}`}
                      data-focusable={`filter-${item}`}
                      aria-pressed={category === item}
                      onClick={() => {
                        setShowHidden(false);
                        setCategory((current) => (current === item ? null : item));
                      }}
                    >
                      {categoryLabel(language, item)}
                    </button>
                  ))}
                  {hiddenCount ? (
                    <button
                      className={`filter-tab${showHidden ? ' selected' : ''}`}
                      data-focusable="filter-hidden"
                      aria-pressed={showHidden}
                      onClick={() => {
                        setCategory(null);
                        setShowHidden((current) => !current);
                      }}
                    >
                      {t('hidden', { count: hiddenCount })}
                    </button>
                  ) : null}
                  {category || showHidden ? (
                    <button
                      className="filter-clear icon-button"
                      data-focusable="filter-clear"
                      aria-label={t('dismissSearch')}
                      onClick={() => {
                        setCategory(null);
                        setShowHidden(false);
                      }}
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
                <label className="search-field">
                  <Search size={21} />
                  <input
                    aria-label={t('findApp')}
                    data-focusable="search"
                    data-focus-up="nav-apps"
                    data-focus-left={hiddenCount ? 'filter-hidden' : 'filter-Utilities'}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('findApp')}
                    autoComplete="off"
                  />
                  {query ? (
                    <button
                      data-focusable="search-clear"
                      aria-label={t('clearCategory')}
                      onClick={() => setQuery('')}
                    >
                      <X size={18} />
                    </button>
                  ) : null}
                </label>
              </div>
              {filteredApps.length ? (
                <div className="app-grid library-grid">
                  {filteredApps.map((app, index) => (
                    <div
                      className={preferences.hidden.includes(app.id) ? 'hidden-app' : ''}
                      key={app.id}
                      data-focus-up={index === 0 ? 'filter-Streaming' : undefined}
                    >
                      {renderTile(app, 'library', favoriteIds.includes(app.id))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Grid2X2 />
                  <h3>
                    {loading
                      ? t('findingApps')
                      : query
                        ? t('noMatches')
                        : showHidden
                          ? t('noHidden')
                          : t('roomForNew')}
                  </h3>
                  <p>
                    {error ||
                      (query
                        ? t('noMatchesHint', { query })
                        : showHidden
                          ? t('hiddenHint')
                          : t('noCategoryApps'))}
                  </p>
                  {error ? (
                    <button
                      className="primary-button"
                      data-focusable="library-retry"
                      onClick={() => void refresh()}
                    >
                      {t('retry')}
                    </button>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
          {page === 'settings' ? (
            <Settings
              preferences={preferences}
              inputs={inputs}
              inputsLoading={loading}
              inputsWarning={inventory.warnings[0]}
              launchers={launcherCards}
              targets={inventory.targets}
              inputIconFor={inputIconFor}
              onNotify={notify}
              systemPreload={systemPreload}
              onToggleSystemPreload={() => {
                if (systemPreload.available !== true) {
                  if (isTV()) notify(systemPreload.error || t('systemPreloadUnavailable'), true);
                  else notify(t('tvOnlyHint'));
                  return;
                }
                if (systemPreload.busy) return;
                notify(t('systemPreloadWorking'));
                systemPreload.toggle().then(
                  (status) =>
                    notify(t(status.enabled ? 'systemPreloadEnabled' : 'systemPreloadDisabled')),
                  (error: unknown) =>
                    notify(
                      t('systemPreloadError', {
                        error: error instanceof Error ? error.message : '',
                      }),
                      true,
                    ),
                );
              }}
              apps={apps}
              packs={packs}
              describeIcon={describeIcon}
              onUpdate={update}
              onRefresh={() => {
                void refresh();
                notify(t('refreshNotice'));
              }}
              onImportUsb={() => {
                notify(t('packsLoading'));
                packs.importFromUsb().then(
                  (count) => notify(count ? t('packsImported', { count }) : t('noUsbPacks')),
                  (error: unknown) =>
                    notify(
                      t('usbError', { error: error instanceof Error ? error.message : '' }),
                      true,
                    ),
                );
              }}
              onReloadPacks={() => {
                void packs.reload().then(() => notify(t('packsReloaded')));
              }}
              onRemovePack={(pack) =>
                packs.remove(pack).then(
                  () => {
                    notify(t('packRemoved', { pack: pack.name }));
                    return true;
                  },
                  (error: unknown) => {
                    notify(error instanceof Error ? error.message : t('tvUnreachable'), true);
                    return false;
                  },
                )
              }
            />
          ) : null}
          {error && inventory.apps.length ? (
            <div className="inventory-warning">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button data-focusable="refresh-error" onClick={() => void refresh()}>
                {t('retry')}
              </button>
            </div>
          ) : null}
        </main>
        {reordering || page !== 'home' ? (
          <footer className="footer">
            <div className="remote-hints" id={reordering ? 'reorder-instructions' : undefined}>
              {reordering ? (
                <>
                  <span>
                    <span className="keycap">← →</span>
                    {t('move')}
                  </span>
                  <span>
                    <span className="keycap">Back</span>
                    {t('done')}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <span className="keycap keycap-ok">OK</span>
                    {page === 'settings' ? t('select') : t('open')}
                  </span>
                  <span>
                    {page === 'settings' ? (
                      <>
                        <span className="keycap">Back</span>
                        {t('homeLabel')}
                      </>
                    ) : (
                      <>
                        <MoreHorizontal size={19} />
                        {t('options')}
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
            {page === 'settings' ? (
              <span className="settings-version" aria-label="LumiOS version 1.1.0">
                v1.1.0
              </span>
            ) : null}
          </footer>
        ) : null}
      </div>
      {optionsApp ? (
        <AppOptions
          key="options"
          app={optionsApp}
          favorites={favoriteIds}
          hidden={preferences.hidden.includes(optionsApp.id)}
          onClose={() => setOptionsApp(null)}
          onPin={() => {
            const pinned = favoriteIds.includes(optionsApp.id);
            update({
              favorites: pinned
                ? favoriteIds.filter((id) => id !== optionsApp.id)
                : [...favoriteIds, optionsApp.id],
              hidden: preferences.hidden.filter((id) => id !== optionsApp.id),
            });
            if (showHidden && hiddenCount === 1 && preferences.hidden.includes(optionsApp.id))
              setShowHidden(false);
            setOptionsApp(null);
            notify(
              pinned
                ? t('favoriteRemoved', { app: optionsApp.title })
                : t('favoriteAdded', { app: optionsApp.title }),
            );
          }}
          onHide={() => {
            const hidden = preferences.hidden.includes(optionsApp.id);
            update({
              hidden: hidden
                ? preferences.hidden.filter((id) => id !== optionsApp.id)
                : [...preferences.hidden, optionsApp.id],
            });
            setOptionsApp(null);
            if (hidden && hiddenCount === 1) setShowHidden(false);
            notify(
              hidden
                ? t('appRestored', { app: optionsApp.title })
                : t('appHidden', { app: optionsApp.title }),
            );
          }}
        />
      ) : null}
      {toast ? (
        <div
          className={`toast${toast.error ? ' toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <CircleAlert size={20} /> : <Sparkles size={20} />}
          <span>{toast.text}</span>
          <button aria-label={t('dismissNotification')} onClick={() => setToast(null)}>
            <X size={18} />
          </button>
        </div>
      ) : null}
      {launching ? (
        <div className="launch-status" role="status">
          <LoaderCircle className="spin" size={18} />
          {t('opening')}
        </div>
      ) : null}
    </div>
  );
}
