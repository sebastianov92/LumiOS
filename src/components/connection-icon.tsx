import {
  Airplay,
  Bluetooth,
  Cast,
  Gamepad2,
  HdmiPort,
  LayoutGrid,
  Monitor,
  Rocket,
  Tv,
  Usb,
} from 'lucide-react';
import type { ResolvedIcon, TVInput } from '../types';

const launcherSymbols: Record<string, typeof Rocket> = {
  airplay: Airplay,
  'com.webos.app.miracast': Cast,
  'com.webos.app.btspeakerapp': Bluetooth,
  'com.webos.app.homeconnect': LayoutGrid,
  'com.webos.app.livetv': Tv,
};

// A pack icon wins; glyphs are masked so they take the card colour, tiles fill the art box.
export function PackInputIcon({ icon }: { icon: ResolvedIcon }) {
  if (icon.source !== 'pack') return null;
  if (icon.kind === 'glyph')
    return (
      <span
        className="input-glyph"
        data-icnl={icon.ref}
        data-connection-icon="pack"
        style={{ WebkitMaskImage: `url("${icon.url}")`, maskImage: `url("${icon.url}")` }}
        aria-hidden="true"
      />
    );
  return (
    <img
      className="input-tile"
      src={icon.url}
      alt=""
      draggable={false}
      data-icnl={icon.ref}
      data-connection-icon="pack"
    />
  );
}

export function ConnectionIcon({ input, icon }: { input: TVInput; icon?: ResolvedIcon }) {
  if (icon?.source === 'pack') return <PackInputIcon icon={icon} />;
  if (input.kind === 'launcher') {
    const Symbol = launcherSymbols[input.target ?? ''] ?? Rocket;
    return <Symbol strokeWidth={1.5} aria-hidden="true" data-connection-icon="launcher" />;
  }
  const name = `${input.title} ${input.port} ${input.id}`;
  if (/play\s*station|(?:^|[\s._-])ps[1-5](?:$|[\s._-])/i.test(name)) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        data-connection-icon="playstation"
        fill="currentColor"
      >
        <path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z" />
      </svg>
    );
  }
  if (/apple[\s._-]*tv/i.test(name)) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        data-connection-icon="apple-tv"
        fill="currentColor"
      >
        <path d="M20.57 17.735h-1.815l-3.34-9.203h1.633l2.02 5.987c.075.231.273.9.586 2.012l.297-.997.33-1.006 2.094-6.004H24zm-5.344-.066a5.76 5.76 0 0 1-1.55.207c-1.23 0-1.84-.693-1.84-2.087V9.646h-1.063V8.532h1.121V7.081l1.476-.602v2.062h1.707v1.113H13.38v5.805c0 .446.074.75.214.932.14.182.396.264.75.264.207 0 .495-.041.883-.115zm-7.29-5.343c.017 1.764 1.55 2.358 1.567 2.366-.017.042-.248.842-.808 1.658-.487.71-.99 1.418-1.79 1.435-.783.016-1.03-.462-1.93-.462-.89 0-1.17.445-1.913.478-.758.025-1.344-.775-1.838-1.484-.998-1.451-1.765-4.098-.734-5.88.51-.89 1.426-1.451 2.416-1.46.75-.016 1.468.512 1.93.512.461 0 1.327-.627 2.234-.536.38.016 1.452.157 2.136 1.154-.058.033-1.278.743-1.27 2.219M6.468 7.988c.404-.495.685-1.18.61-1.864-.585.025-1.294.388-1.723.883-.38.437-.71 1.138-.619 1.806.652.05 1.328-.338 1.732-.825Z" />
      </svg>
    );
  }
  if (/(?:^|[\s._-])usb(?:$|[\s._-]|\d)/i.test(name))
    return <Usb strokeWidth={1.5} aria-hidden="true" data-connection-icon="usb" />;
  if (input.kind === 'console')
    return <Gamepad2 strokeWidth={1.5} aria-hidden="true" data-connection-icon="console" />;
  if (input.kind === 'computer')
    return <Monitor strokeWidth={1.5} aria-hidden="true" data-connection-icon="computer" />;
  if (input.kind === 'streamer')
    return <Tv strokeWidth={1.5} aria-hidden="true" data-connection-icon="streamer" />;
  return <HdmiPort strokeWidth={1.5} aria-hidden="true" data-connection-icon="hdmi" />;
}
