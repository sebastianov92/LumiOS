import { ConnectionIcon } from './connection-icon';
import { InputStatus } from './input-status';
import { inputHeading } from '../inputs';
import type { ResolvedIcon, TVInput } from '../types';

export function InputCard({
  input,
  icon,
  onLaunch,
}: {
  input: TVInput;
  icon?: ResolvedIcon;
  onLaunch: (input: TVInput) => void;
}) {
  return (
    <button
      className={`input-card input-${input.kind}`}
      data-focusable={`input-${input.id}`}
      onClick={() => onLaunch(input)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') event.currentTarget.focus({ preventScroll: true });
      }}
    >
      <span className="input-art">
        <ConnectionIcon input={input} icon={icon} />
      </span>
      <span className="input-info">
        <span className="input-title">{inputHeading(input)}</span>
        <span className="input-state">
          <InputStatus input={input} />
        </span>
      </span>
    </button>
  );
}
