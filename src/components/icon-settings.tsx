import type { KeyboardEvent } from 'react';
import {
  AppWindow,
  Check,
  ChevronRight,
  HardDrive,
  Package,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { iconRef, type IconKind } from '../icnl';
import { PACKS_DIR, type StoredPack } from '../packs';
import { useTranslation, type MessageKey } from '../i18n';
import { isTV } from '../bridge';
import { BUILTIN_PREFIX, builtinIconNames } from '../inputs';
import { BuiltinSymbol } from './connection-icon';
import type { BuiltinIconName, ResolvedIcon, TVApp } from '../types';

export type IconSourceKind = 'pack' | 'tv' | 'builtin' | 'generic';
export interface IconDescription {
  icon?: ResolvedIcon;
  source: IconSourceKind;
  packName?: string;
}

export function IconPreview({ icon }: { icon?: ResolvedIcon }) {
  return (
    <span
      className="icon-preview"
      data-source={icon?.source}
      data-icnl={icon?.source === 'pack' ? icon.ref : undefined}
      style={icon?.source === 'tv' ? { background: icon.color } : undefined}
      aria-hidden="true"
    >
      {icon?.source === 'builtin' ? (
        <BuiltinSymbol name={icon.name} />
      ) : icon?.source === 'pack' && icon.kind === 'glyph' ? (
        <span
          className="icon-preview-glyph"
          style={{ WebkitMaskImage: `url("${icon.url}")`, maskImage: `url("${icon.url}")` }}
        />
      ) : icon ? (
        <img src={icon.url} alt="" draggable={false} />
      ) : (
        <AppWindow />
      )}
    </span>
  );
}

const openWithRight = (handler: () => void) => ({
  onClick: handler,
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    handler();
  },
});

export function IconSettings({
  packs,
  loading,
  apps,
  describe,
  onOpenPack,
  onOpenApp,
  onImportUsb,
  onReload,
}: {
  packs: StoredPack[];
  loading: boolean;
  apps: TVApp[];
  describe: (app: TVApp) => IconDescription;
  onOpenPack: (pack: StoredPack) => void;
  onOpenApp: (app: TVApp) => void;
  onImportUsb: () => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const order = [
    ...packs.map((pack) => `setting-pack-${pack.id}`),
    'setting-icons-usb',
    'setting-icons-reload',
    ...apps.map((app) => `setting-app-icon-${app.id}`),
  ];
  const focus = (id: string) => {
    const index = order.indexOf(id);
    return {
      'data-focusable': id,
      'data-focus-up': index > 0 ? order[index - 1] : 'settings-section-icons',
      'data-focus-down': order[index + 1],
    };
  };
  const sourceLabel = (description: IconDescription) =>
    description.source === 'pack'
      ? (description.packName ?? t('iconPacks'))
      : description.source === 'tv'
        ? t('sourceTV')
        : description.source === 'builtin'
          ? t('sourceBuiltin')
          : t('sourceGeneric');
  return (
    <section className="settings-content" aria-label={t('icons')}>
      <h2 className="settings-group-title">{t('iconPacks')}</h2>
      {packs.length ? (
        <div className="settings-group">
          {packs.map((pack) => (
            <button
              key={pack.id}
              className="setting-row settings-list-item"
              {...focus(`setting-pack-${pack.id}`)}
              {...openWithRight(() => onOpenPack(pack))}
            >
              <Package aria-hidden="true" />
              <span>
                <strong>{pack.name}</strong>
                <small>
                  {pack.error
                    ? t('packError', { error: pack.error })
                    : [
                        pack.version ? `v${pack.version}` : '',
                        pack.author,
                        t('iconCount', { count: pack.icons.length }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </small>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <p className="settings-description" role="status">
          {loading
            ? t('packsLoading')
            : `${t('noPacks')} ${t('packsHint', { folder: PACKS_DIR })}${isTV() ? '' : ` ${t('devPacksHint')}`}`}
        </p>
      )}
      <div className="settings-group">
        <button className="setting-row" {...focus('setting-icons-usb')} onClick={onImportUsb}>
          <HardDrive aria-hidden="true" />
          <span>
            <strong>{t('importUsb')}</strong>
          </span>
        </button>
        <button className="setting-row" {...focus('setting-icons-reload')} onClick={onReload}>
          <RefreshCw aria-hidden="true" />
          <span>
            <strong>{t('rereadPacks')}</strong>
          </span>
        </button>
      </div>
      {apps.length ? (
        <>
          <h2 className="settings-group-title">{t('appIcons')}</h2>
          <div className="settings-group">
            {apps.map((app) => {
              const description = describe(app);
              return (
                <button
                  key={app.id}
                  className="setting-row settings-list-item"
                  {...focus(`setting-app-icon-${app.id}`)}
                  {...openWithRight(() => onOpenApp(app))}
                >
                  <IconPreview icon={description.icon} />
                  <span>
                    <strong>{app.title}</strong>
                    <small>{sourceLabel(description)}</small>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function PackDetail({ pack, onRemove }: { pack: StoredPack; onRemove: () => void }) {
  const { t } = useTranslation();
  const summary = [
    pack.version ? `v${pack.version}` : '',
    pack.author,
    pack.error ? '' : t('iconCount', { count: pack.icons.length }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div>
      {summary ? <p className="settings-description">{summary}</p> : null}
      {pack.error ? (
        <p className="settings-description" role="status">
          {t('packError', { error: pack.error })}
        </p>
      ) : null}
      <p className="settings-description settings-path">{pack.path}</p>
      <div className="settings-group">
        <button
          className="setting-row"
          data-focusable="pack-remove"
          data-focus-up="nav-settings"
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
          <span>
            <strong>{t('removePack')}</strong>
            <small>{t('removePackHint')}</small>
          </span>
        </button>
      </div>
    </div>
  );
}

export interface IconOption {
  id: string;
  label: string;
  hint?: string;
  icon?: ResolvedIcon;
}

// One option per pack icon of the requested kinds, glyphs before tiles when both are allowed.
export function packIconOptions(
  packs: StoredPack[],
  urls: Map<string, string>,
  kinds: IconKind[],
): IconOption[] {
  return kinds.flatMap((kind) =>
    packs.flatMap((pack) =>
      pack.icons
        .filter((icon) => icon.meta.kind === kind)
        .map((icon) => {
          const ref = iconRef(pack.id, icon.meta.slug);
          return {
            id: ref,
            label: icon.meta.title,
            hint: pack.name,
            icon: { source: 'pack' as const, url: urls.get(ref) ?? '', ref, kind },
          };
        }),
    ),
  );
}

export function IconOptionList({
  prefix,
  label,
  options,
  selected,
  onChange,
}: {
  prefix: string;
  label: string;
  options: IconOption[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="settings-subpage-options" role="listbox" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          role="option"
          aria-selected={selected === option.id}
          className="setting-row settings-list-item"
          data-focusable={`${prefix}-${option.id}`}
          data-focus-up={index ? `${prefix}-${options[index - 1].id}` : 'nav-settings'}
          data-focus-down={`${prefix}-${options[(index + 1) % options.length].id}`}
          onClick={() => onChange(option.id)}
        >
          {option.icon ? <IconPreview icon={option.icon} /> : null}
          <span>
            <strong>{option.label}</strong>
            {option.hint ? <small>{option.hint}</small> : null}
          </span>
          {selected === option.id ? <Check aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

export function AppIconPicker({
  app,
  packs,
  urls,
  value,
  onChange,
}: {
  app: TVApp;
  packs: StoredPack[];
  urls: Map<string, string>;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <IconOptionList
      prefix="app-icon-option"
      label={app.title}
      options={[
        { id: 'auto', label: t('iconAuto'), hint: t('iconAutoHint') },
        { id: 'tv', label: t('iconTV') },
        ...packIconOptions(packs, urls, ['tile']),
      ]}
      selected={value ?? 'auto'}
      onChange={(id) => onChange(id === 'auto' ? undefined : id)}
    />
  );
}

const builtinIconLabels: Record<BuiltinIconName, MessageKey> = {
  hdmi: 'iconHdmi',
  console: 'iconConsole',
  streamer: 'iconStreamer',
  computer: 'iconComputer',
  usb: 'iconUsb',
  playstation: 'iconPlaystation',
  'apple-tv': 'iconAppleTv',
  airplay: 'iconAirplay',
  cast: 'iconCast',
  bluetooth: 'iconBluetooth',
  dashboard: 'iconDashboard',
  tv: 'iconTv',
  rocket: 'iconRocket',
};

// LumiOS's own symbols as picker options; available without any pack installed.
export function builtinIconOptions(
  t: (key: MessageKey) => string,
  names: BuiltinIconName[] = builtinIconNames,
): IconOption[] {
  return names.map((name) => ({
    id: `${BUILTIN_PREFIX}${name}`,
    label: t(builtinIconLabels[name]),
    hint: t('builtinIcons'),
    icon: { source: 'builtin', name },
  }));
}
