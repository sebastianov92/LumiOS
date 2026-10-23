import {
  demoApps,
  demoInputs,
  demoTargets,
  normalizeApps,
  normalizeInputs,
  normalizeTargets,
  validAppId,
} from './catalog';
import type { Inventory, NativeBridge } from './types';

const active = new Set<NativeBridge>();
export const isTV = () =>
  typeof window !== 'undefined' &&
  !!(window.PalmSystem || window.webOSSystem) &&
  !!(window.PalmServiceBridge || window.webOSServiceBridge);
const manager = 'luna://com.webos.applicationManager/';

export function nativeCall(
  uri: string,
  payload: Record<string, unknown>,
  timeout = 6500,
  limit = 2 * 1024 * 1024,
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const Bridge = window.PalmServiceBridge ?? window.webOSServiceBridge;
    if (!Bridge) {
      reject(new Error('This action is available on the TV.'));
      return;
    }
    let bridge: NativeBridge | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let done = false;
    const finish = (error: Error | null, result?: Record<string, any>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (bridge) {
        active.delete(bridge);
        bridge.onservicecallback = () => {};
        try {
          bridge.cancel();
        } catch {
          /* Native object may already be closed. */
        }
      }
      if (error) reject(error);
      else resolve(result!);
    };
    timer = setTimeout(
      () =>
        finish(
          new Error(
            'The TV did not respond. Check Homebrew Channel’s root status, then try again.',
          ),
        ),
      timeout,
    );
    try {
      bridge = new Bridge();
      active.add(bridge);
      bridge.onservicecallback = (raw) => {
        try {
          if (typeof raw !== 'string' || raw.length > limit)
            throw new Error('The TV returned an unreadable response.');
          const value = JSON.parse(raw);
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('The TV returned an unreadable response.');
          if (
            value.returnValue !== true ||
            (value.errorCode !== undefined && value.errorCode !== 0 && value.errorCode !== '0')
          ) {
            throw new Error(
              typeof value.errorText === 'string'
                ? value.errorText.slice(0, 240)
                : 'The TV denied this action.',
            );
          }
          finish(null, value);
        } catch (error) {
          finish(
            error instanceof Error ? error : new Error('The TV returned an unreadable response.'),
          );
        }
      };
      bridge.call(uri, JSON.stringify(payload));
    } catch {
      finish(new Error('The webOS service bridge is unavailable.'));
    }
  });
}

async function inventoryRead(uri: string, field: string): Promise<unknown> {
  // Read private inventory APIs through the existing elevated Homebrew service.
  // No credentials or environment reads.
  const command = `if [ "$(id -u)" = "0" ]; then /usr/bin/luna-send -n 1 -w 4000 ${uri} '{}'; else printf '%s\\n' '{"returnValue":false,"errorText":"Homebrew Channel needs root access."}'; fi`;
  const envelope = await nativeCall('luna://org.webosbrew.hbchannel.service/exec', { command });
  if (
    [envelope.returnCode, envelope.exitCode].some(
      (code) => code !== undefined && code !== 0 && code !== '0',
    ) ||
    envelope.error ||
    envelope.stderrString
  )
    throw new Error('Homebrew Channel could not read the TV inventory. Check its root status.');
  if (typeof envelope.stdoutString !== 'string' || envelope.stdoutString.length > 2 * 1024 * 1024)
    throw new Error('Homebrew Channel returned no inventory.');
  const response = JSON.parse(envelope.stdoutString);
  if (response?.returnValue !== true || !Array.isArray(response[field]))
    throw new Error(response?.errorText || 'The TV did not return its inventory.');
  return response[field];
}

export async function loadInventory(): Promise<Inventory> {
  if (!isTV())
    return {
      apps: demoApps,
      inputs: demoInputs,
      targets: demoTargets,
      warnings: [],
    };
  const [apps, inputs] = await Promise.allSettled([
    inventoryRead(`${manager}listApps`, 'apps').then((raw) => ({
      apps: normalizeApps(raw),
      targets: normalizeTargets(raw),
    })),
    inventoryRead('luna://com.webos.service.eim/getAllInputStatus', 'devices').then(
      normalizeInputs,
    ),
  ]);
  if (apps.status === 'rejected')
    throw new Error(
      `Couldn’t load your apps. ${apps.reason instanceof Error ? apps.reason.message : 'Check Homebrew Channel’s root status.'}`,
    );
  return {
    apps: apps.value.apps,
    targets: apps.value.targets,
    inputs: inputs.status === 'fulfilled' ? inputs.value : [],
    warnings:
      inputs.status === 'rejected' ? ['Inputs couldn’t be loaded. Refresh to try again.'] : [],
  };
}

// Public launch first; system apps the public bus refuses (AirPlay, Screen Share…) are retried
// on the private bus through Homebrew Channel's root shell. Failures keep the TV's own text.
export async function launchApp(id: string, options: { verify?: boolean } = {}): Promise<void> {
  if (!validAppId(id)) throw new Error('This app has an invalid identifier.');
  if (!isTV()) return;
  if (options.verify !== false) {
    const status = await nativeCall(`${manager}getAppLoadStatus`, { appId: id });
    if (status.exist !== true)
      throw new Error('This app is no longer installed. Refresh your library.');
  }
  try {
    // Public API + declared ACGs, rather than rewriting any system permissions.
    await nativeCall(`${manager}launch`, { id });
  } catch (error) {
    const reply = await rootLaunch(id).catch(() => null);
    if (reply?.returnValue === true) return;
    const detail = typeof reply?.errorText === 'string' ? ` ${reply.errorText.slice(0, 160)}` : '';
    throw new Error(
      `${error instanceof Error ? error.message : 'The TV refused to open this app.'}${detail}`,
    );
  }
}

// webOS 10+ root-shell launches need -t; the id is already validated for the shell.
const rootLaunchCommand = (id: string) =>
  `case "$(cat /etc/starfish-release 2>/dev/null)" in *" 10."*|*" 11."*) FLAG=-t ;; *) FLAG=-n ;; esac; /usr/bin/luna-send "$FLAG" 1 -w 5000 luna://com.webos.service.applicationmanager/launch '{"id":"${id}"}'`;

async function rootLaunch(id: string): Promise<Record<string, unknown> | null> {
  const text = new TextDecoder().decode(await execBytes(rootLaunchCommand(id), 8000));
  const line = text
    .trim()
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('{'))
    .pop();
  return line ? (JSON.parse(line) as Record<string, unknown>) : null;
}

export function platformBack(): void {
  const system = window.PalmSystem ?? window.webOSSystem;
  system?.platformBack?.();
}

export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Run a root shell command through Homebrew Channel and return its raw stdout. The service
// buffers at most about 1 MiB of output, so callers keep each command's output small.
export async function execBytes(command: string, timeout = 20000): Promise<Uint8Array> {
  const envelope = await nativeCall(
    'luna://org.webosbrew.hbchannel.service/exec',
    { command },
    timeout,
    8 * 1024 * 1024,
  );
  if (typeof envelope.stdoutBytes === 'string') return decodeBase64(envelope.stdoutBytes);
  if (typeof envelope.stdoutString === 'string')
    return new TextEncoder().encode(envelope.stdoutString);
  throw new Error('Homebrew Channel returned no output.');
}
