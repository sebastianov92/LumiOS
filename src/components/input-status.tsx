import { useTranslation } from '../i18n';
import type { TVInput } from '../types';

// Secondary line of an input card or row: the launcher target, or the port plus connection
// state for a renamed input, or the TV label plus connection state.
export function InputStatus({ input }: { input: TVInput }) {
  const { t } = useTranslation();
  if (input.kind === 'launcher') return input.port;
  const state =
    input.connected === false
      ? t('noDevice')
      : input.connected !== true
        ? t('externalInput')
        : t('connected');
  if (input.named) return `${input.port} · ${state}`;
  return input.connected === true && input.title !== input.port
    ? `${input.title} · ${state}`
    : state;
}
