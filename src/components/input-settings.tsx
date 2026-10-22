import { useEffect, useState, type KeyboardEvent } from 'react';
import { Check, ChevronRight, Plus, RefreshCw, Rocket, Trash2, Type } from 'lucide-react';
import { ConnectionIcon } from './connection-icon';
import { InputStatus } from './input-status';
import {
  cleanName,
  getInputVisibility,
  inputHeading,
  inputVisibilityModes,
  launcherSuggestions,
  launcherVisibilityModes,
  MAX_INPUT_NAME,
} from '../inputs';
import { useTranslation } from '../i18n';
import type { AppTarget, InputVisibility, Preferences, ResolvedIcon, TVInput } from '../types';

const visibilityLabels = { on: 'stateOn', off: 'stateOff', auto: 'stateAuto' } as const;
const visibilityDescriptions = {
  on: 'inputAlways',
  off: 'inputNever',
  auto: 'inputWhenConnected',
} as const;

const openWithRight = (handler: () => void) => ({
  onClick: handler,
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    handler();
  },
});

// Explicit up/down routes through an ordered list of focusables; the first row goes up to `top`.
const chain = (order: string[], top: string) => (id: string) => {
  const index = order.indexOf(id);
  return {
    'data-focusable': id,
    'data-focus-up': index > 0 ? order[index - 1] : top,
    'data-focus-down': order[index + 1],
  };
};

export function InputSettings({
  inputs,
  launchers,
  visibility,
  loading,
  warning,
  iconFor,
  onOpen,
  onOpenLauncher,
  onAddLauncher,
  onRefresh,
}: {
  inputs: TVInput[];
  launchers: TVInput[];
  visibility: Preferences['inputVisibility'];
  loading: boolean;
  warning?: string;
  iconFor: (input: TVInput) => ResolvedIcon | undefined;
  onOpen: (input: TVInput) => void;
  onOpenLauncher: (launcher: TVInput) => void;
  onAddLauncher: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const order = [
    ...inputs.map((input) => `setting-input-${input.id}`),
    ...launchers.map((launcher) => `setting-launcher-${launcher.id}`),
    'setting-add-launcher',
    'setting-inputs-refresh',
  ];
  const focus = chain(order, 'settings-section-inputs');
  return (
    <section className="settings-content" aria-label={t('inputs')}>
      {warning ? (
        <p className="settings-description" role="status">
          {warning}
        </p>
      ) : null}
      {inputs.length ? (
        <div className="settings-group">
          {inputs.map((input) => (
            <button
              key={input.id}
              className="setting-row settings-list-item"
              {...focus(`setting-input-${input.id}`)}
              {...openWithRight(() => onOpen(input))}
            >
              <ConnectionIcon input={input} icon={iconFor(input)} />
              <span>
                <strong>{inputHeading(input)}</strong>
                <small>
                  <InputStatus input={input} />
                </small>
              </span>
              <span className="setting-value">
                {t(visibilityLabels[getInputVisibility(input.id, visibility)])}
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <p className="settings-description" role="status">
          {t(loading ? 'findingInputs' : 'noInputs')}
        </p>
      )}
      <h2 className="settings-group-title">{t('launchers')}</h2>
      <div className="settings-group">
        {launchers.map((launcher) => (
          <button
            key={launcher.id}
            className="setting-row settings-list-item"
            {...focus(`setting-launcher-${launcher.id}`)}
            {...openWithRight(() => onOpenLauncher(launcher))}
          >
            <ConnectionIcon input={launcher} icon={iconFor(launcher)} />
            <span>
              <strong>{launcher.title}</strong>
              <small>
                {t('launcherOpens')} {launcher.port}
              </small>
            </span>
            <span className="setting-value">
              {t(getInputVisibility(launcher.id, visibility) === 'off' ? 'stateOff' : 'stateOn')}
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
        <button
          className="setting-row settings-list-item"
          {...focus('setting-add-launcher')}
          {...openWithRight(onAddLauncher)}
        >
          <Plus aria-hidden="true" />
          <span>
            <strong>{t('addLauncher')}</strong>
            <small>{t('launcherHint')}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="settings-group">
        <button className="setting-row" {...focus('setting-inputs-refresh')} onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          <span>
            <strong>{t('refreshInputs')}</strong>
          </span>
        </button>
      </div>
    </section>
  );
}

// Inline text field. Each keystroke updates the preference; Enter and blur trim it.
function NameField({
  id,
  value,
  placeholder,
  onChange,
  focus,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  focus: Record<string, string | undefined>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Mirror an external preference change.
    setDraft(value);
  }, [value]);
  const commit = () => {
    const clean = cleanName(draft);
    setDraft(clean);
    if (clean !== value) onChange(clean);
  };
  return (
    <label className="setting-row setting-field">
      <Type aria-hidden="true" />
      <span>
        <strong>{t('inputName')}</strong>
        <small>{t('inputNameHint')}</small>
      </span>
      <input
        type="text"
        id={id}
        aria-label={t('inputName')}
        value={draft}
        placeholder={placeholder}
        maxLength={MAX_INPUT_NAME}
        autoComplete="off"
        {...focus}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value.slice(0, MAX_INPUT_NAME));
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          event.stopPropagation();
          commit();
          event.currentTarget.blur();
          const next = event.currentTarget.dataset.focusDown;
          if (next)
            document
              .querySelector<HTMLElement>(`[data-focusable="${next}"]`)
              ?.focus({ preventScroll: true });
        }}
      />
    </label>
  );
}

function IconRow({
  input,
  icon,
  label,
  focus,
  onOpen,
}: {
  input: TVInput;
  icon?: ResolvedIcon;
  label: string;
  focus: Record<string, string | undefined>;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button className="setting-row settings-list-item" {...focus} {...openWithRight(onOpen)}>
      <span className={`icon-preview input-${input.kind}`} aria-hidden="true">
        <ConnectionIcon input={input} icon={icon} />
      </span>
      <span>
        <strong>{t('inputIcon')}</strong>
      </span>
      <span className="setting-value">{label}</span>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

function VisibilityOptions<Mode extends InputVisibility>({
  modes,
  prefix,
  value,
  label,
  above,
  onChange,
}: {
  modes: readonly Mode[];
  prefix: string;
  value: Mode;
  label: string;
  above: string;
  onChange: (mode: Mode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="settings-group" role="listbox" aria-label={label}>
      {modes.map((mode, index) => (
        <button
          key={mode}
          type="button"
          className="setting-row settings-list-item"
          role="option"
          aria-selected={value === mode}
          data-focusable={`${prefix}-${mode}`}
          data-focus-up={index ? `${prefix}-${modes[index - 1]}` : above}
          data-focus-down={`${prefix}-${modes[(index + 1) % modes.length]}`}
          onClick={() => onChange(mode)}
        >
          <span>
            <strong>{t(visibilityLabels[mode])}</strong>
            <small>{t(visibilityDescriptions[mode])}</small>
          </span>
          {value === mode ? <Check aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

export function InputDetail({
  input,
  name,
  visibility,
  icon,
  iconLabel,
  onName,
  onOpenIcon,
  onVisibility,
}: {
  input: TVInput;
  name: string;
  visibility: InputVisibility;
  icon?: ResolvedIcon;
  iconLabel: string;
  onName: (name: string) => void;
  onOpenIcon: () => void;
  onVisibility: (mode: InputVisibility) => void;
}) {
  const { t } = useTranslation();
  const focus = chain(['input-name', 'input-icon'], 'nav-settings');
  return (
    <div>
      <div className="settings-group">
        <NameField
          id="input-name"
          value={name}
          placeholder={input.port}
          onChange={onName}
          focus={{ ...focus('input-name'), 'data-focus-down': 'input-icon' }}
        />
        <IconRow
          input={input}
          icon={icon}
          label={iconLabel}
          focus={{ ...focus('input-icon'), 'data-focus-down': 'input-visibility-option-on' }}
          onOpen={onOpenIcon}
        />
      </div>
      <h2 className="settings-group-title">{t('visibility')}</h2>
      <VisibilityOptions
        modes={inputVisibilityModes}
        prefix="input-visibility-option"
        value={visibility}
        label={t('visibility')}
        above="input-icon"
        onChange={onVisibility}
      />
    </div>
  );
}

export function LauncherDetail({
  launcher,
  visibility,
  icon,
  iconLabel,
  onName,
  onOpenIcon,
  onOpenTarget,
  onVisibility,
  onDelete,
}: {
  launcher: TVInput;
  visibility: 'on' | 'off';
  icon?: ResolvedIcon;
  iconLabel: string;
  onName: (name: string) => void;
  onOpenIcon: () => void;
  onOpenTarget: () => void;
  onVisibility: (mode: 'on' | 'off') => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const focus = chain(['launcher-name', 'launcher-icon', 'launcher-target'], 'nav-settings');
  return (
    <div>
      <div className="settings-group">
        <NameField
          id="launcher-name"
          value={launcher.title}
          placeholder={launcher.port}
          onChange={onName}
          focus={focus('launcher-name')}
        />
        <IconRow
          input={launcher}
          icon={icon}
          label={iconLabel}
          focus={focus('launcher-icon')}
          onOpen={onOpenIcon}
        />
        <button
          className="setting-row settings-list-item"
          {...focus('launcher-target')}
          data-focus-down="launcher-visibility-option-on"
          {...openWithRight(onOpenTarget)}
        >
          <Rocket aria-hidden="true" />
          <span>
            <strong>{t('launcherOpens')}</strong>
          </span>
          <span className="setting-value">{launcher.port}</span>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <h2 className="settings-group-title">{t('visibility')}</h2>
      <VisibilityOptions
        modes={launcherVisibilityModes}
        prefix="launcher-visibility-option"
        value={visibility}
        label={t('visibility')}
        above="launcher-target"
        onChange={onVisibility}
      />
      <div className="settings-group">
        <button
          className="setting-row"
          data-focusable="launcher-delete"
          data-focus-up="launcher-visibility-option-off"
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
          <span>
            <strong>{t('deleteLauncher')}</strong>
          </span>
        </button>
      </div>
    </div>
  );
}

// Suggested TV apps first, then everything else the TV can launch.
export function orderTargets(targets: AppTarget[]): { suggested: AppTarget[]; rest: AppTarget[] } {
  const suggested = launcherSuggestions.flatMap(
    (id) => targets.find((target) => target.id === id) ?? [],
  );
  const rest = targets.filter((target) => !suggested.includes(target));
  return { suggested, rest };
}

export function TargetPicker({
  targets,
  selected,
  onChange,
}: {
  targets: AppTarget[];
  selected?: string;
  onChange: (target: AppTarget) => void;
}) {
  const { t } = useTranslation();
  const { suggested, rest } = orderTargets(targets);
  const all = [...suggested, ...rest];
  const focus = chain(
    all.map((target) => `target-option-${target.id}`),
    'nav-settings',
  );
  const row = (target: AppTarget) => (
    <button
      key={target.id}
      type="button"
      role="option"
      aria-selected={selected === target.id}
      className="setting-row settings-list-item"
      {...focus(`target-option-${target.id}`)}
      onClick={() => onChange(target)}
    >
      <span>
        <strong>{target.title}</strong>
        <small>{target.id}</small>
      </span>
      {selected === target.id ? <Check aria-hidden="true" /> : null}
    </button>
  );
  if (!all.length)
    return (
      <p className="settings-description" role="status">
        {t('noInputs')}
      </p>
    );
  return (
    <div role="listbox" aria-label={t('chooseTarget')}>
      {suggested.length ? (
        <>
          <h2 className="settings-group-title">{t('suggested')}</h2>
          <div className="settings-group">{suggested.map(row)}</div>
        </>
      ) : null}
      {rest.length ? (
        <>
          <h2 className="settings-group-title">{t('allApps')}</h2>
          <div className="settings-group">{rest.map(row)}</div>
        </>
      ) : null}
    </div>
  );
}
