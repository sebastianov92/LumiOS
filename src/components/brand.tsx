import { AppWindow, Coffee, Gamepad2, Globe, MonitorPlay, Settings2, Tv } from 'lucide-react';
import type { ResolvedIcon, TVApp } from '../types';
import { useTranslation } from '../i18n';

const logos: Record<string, string> = {
  apple: 'apple-tv',
  prime: 'prime-video',
  disney: 'disney-plus',
  jellyfin: 'jellyfin',
  netflix: 'netflix',
  youtube: 'youtube',
  arte: 'arte',
  zdf: 'zdf',
  'das-erste': 'das-erste',
};

// Icon priority: an icon pack entry → the app's own icon read from the TV → built-in brand
// artwork → a generic symbol with the app name.
export function Brand({ app, icon }: { app: TVApp; icon?: ResolvedIcon }) {
  const { t } = useTranslation();
  if (icon)
    return (
      <span className={icon.source === 'pack' ? 'brand-pack' : 'brand-installed'}>
        <img
          className={icon.source === 'pack' ? 'brand-pack-icon' : 'brand-installed-icon'}
          src={icon.url}
          alt=""
          draggable={false}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
            const label = event.currentTarget.nextElementSibling as HTMLElement | null;
            if (label) label.hidden = false;
          }}
        />
        <span hidden>{app.title}</span>
      </span>
    );
  const logo = logos[app.brand];
  if (logo)
    return (
      <img
        className={`brand-logo brand-logo-${app.brand}`}
        src={`./logos/${logo}.svg`}
        alt=""
        draggable={false}
      />
    );
  switch (app.brand) {
    case 'live-tv':
      return (
        <span className="brand-symbol">
          <Tv />
          <span>{t('liveTV')}</span>
        </span>
      );
    case 'plex':
      return (
        <span className="wordmark wordmark-plex">
          ple<span className="plex-x">x</span>
        </span>
      );
    case 'spotify':
      return (
        <span className="wordmark wordmark-spotify">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="24" fill="currentColor" />
            <g fill="none" stroke="#15271c" strokeLinecap="round">
              <path d="M11 18q15-6 27 2" strokeWidth="4" />
              <path d="M13 25q13-5 23 2" strokeWidth="3.5" />
              <path d="M15 32q10-4 18 1" strokeWidth="3" />
            </g>
          </svg>
          Spotify
        </span>
      );
    case 'homebrew':
      return (
        <span className="brand-symbol">
          <Coffee />
          <span>{t('homebrew')}</span>
        </span>
      );
    case 'kodi':
      return (
        <span className="wordmark wordmark-kodi">
          <span className="kodi-symbol">❖</span>kodi
        </span>
      );
    case 'moonlight':
      return (
        <span className="brand-symbol">
          <MonitorPlay />
          <span>Moonlight</span>
        </span>
      );
    case 'browser':
      return (
        <span className="brand-symbol">
          <Globe />
          <span>{t('browser')}</span>
        </span>
      );
    case 'gaming':
      return (
        <span className="brand-symbol">
          <Gamepad2 />
          <span>{app.title}</span>
        </span>
      );
    case 'settings':
      return (
        <span className="brand-symbol">
          <Settings2 />
          <span>{t('settings')}</span>
        </span>
      );
    default:
      return (
        <span className="brand-symbol brand-generic">
          <AppWindow />
          <span>{app.title}</span>
        </span>
      );
  }
}
