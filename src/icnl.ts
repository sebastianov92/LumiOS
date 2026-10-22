import { validAppId } from './catalog';

// The .icnl icon pack format: a ZIP holding pack.json plus icons/<slug>/icon.<svg|png|jpg|webp>
// and an optional icons/<slug>/style.css whose root selector is `.icon`. This module is pure so
// the TV app, the CLI and the tests share one definition.
export const ICNL_FORMAT = 'icnl/1';
export const ICNL_EXTENSION = '.icnl';
export type IconKind = 'tile' | 'glyph';
export const iconFileTypes: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const MAX_PACK_ICONS = 400;
export const MAX_ICON_FILE_BYTES = 1024 * 1024;
export const MAX_ICON_CSS = 20 * 1024;
const MAX_MATCH_PATTERN = 200;

export interface PackIconMeta {
  slug: string;
  title: string;
  kind: IconKind;
  apps: string[];
  inputs: string[];
  launcher: boolean;
  match: string;
}

export interface PackManifest {
  format: typeof ICNL_FORMAT;
  name: string;
  version: string;
  author: string;
  icons: PackIconMeta[];
}

export interface PackIcon {
  meta: PackIconMeta;
  type: string;
  data: ArrayBuffer;
  // Raw stylesheet; scopeIconCss() sanitizes and scopes it where it is injected.
  css: string;
}

export interface IconPack {
  id: string;
  name: string;
  version: string;
  author: string;
  icons: PackIcon[];
}

export const validPackId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);
export const validSlug = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
export const iconRef = (packId: string, slug: string) => `${packId}/${slug}`;

export function parseIconRef(ref: unknown): { packId: string; slug: string } | null {
  if (typeof ref !== 'string') return null;
  const index = ref.indexOf('/');
  if (index < 0) return null;
  const packId = ref.slice(0, index);
  const slug = ref.slice(index + 1);
  return validPackId(packId) && validSlug(slug) ? { packId, slug } : null;
}

// Per-app choice: a pack icon reference, or "tv" to skip packs and use the TV's own icon.
export const validIconOverride = (value: unknown): value is string =>
  value === 'tv' || parseIconRef(value) !== null;

// oxlint-disable-next-line eslint/no-control-regex -- Strip control characters from pack text.
const controls = /[\u0000-\u001f\u007f]/g;
const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(controls, '').trim().slice(0, max) : '';
const idList = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter(validAppId))].slice(0, 50) : [];

export function parseManifest(raw: unknown): PackManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('pack.json must be a JSON object.');
  const manifest = raw as Record<string, unknown>;
  if (manifest.format !== ICNL_FORMAT)
    throw new Error(`Unsupported pack format. Expected "format": "${ICNL_FORMAT}".`);
  const name = clean(manifest.name, 80);
  if (!name) throw new Error('pack.json needs a "name".');
  if (!manifest.icons || typeof manifest.icons !== 'object' || Array.isArray(manifest.icons))
    throw new Error('pack.json needs an "icons" object keyed by slug.');
  const icons: PackIconMeta[] = [];
  for (const [slug, entry] of Object.entries(manifest.icons)) {
    if (!validSlug(slug))
      throw new Error(`Invalid icon slug "${slug}". Use lowercase letters, digits and dashes.`);
    if (icons.length >= MAX_PACK_ICONS)
      throw new Error(`A pack holds at most ${MAX_PACK_ICONS} icons.`);
    const fields =
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const match = clean(fields.match, MAX_MATCH_PATTERN);
    if (match)
      try {
        new RegExp(match, 'i');
      } catch {
        throw new Error(`Icon "${slug}" has an invalid "match" pattern.`);
      }
    icons.push({
      slug,
      title: clean(fields.title, 80) || slug,
      kind: fields.kind === 'glyph' ? 'glyph' : 'tile',
      apps: idList(fields.apps),
      inputs: idList(fields.inputs),
      launcher: fields.launcher === true,
      match,
    });
  }
  if (!icons.length) throw new Error('pack.json lists no icons.');
  return {
    format: ICNL_FORMAT,
    name,
    version: clean(manifest.version, 32) || '0.0.0',
    author: clean(manifest.author, 80),
    icons,
  };
}

const unsafeDeclaration =
  /expression\s*\(|javascript:|-moz-binding|behavior\s*:|@import|<\/?style/i;
function safeDeclaration(declaration: string): boolean {
  if (unsafeDeclaration.test(declaration)) return false;
  for (const match of declaration.matchAll(/url\(\s*['"]?([^'")]*)/gi))
    if (!match[1].trim().toLowerCase().startsWith('data:')) return false;
  return true;
}

// Splits on semicolons that sit outside parentheses and quotes, so data: URLs stay whole.
function splitDeclarations(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ';' && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

function buildRule(selector: string, body: string, scope: string): string {
  const selectors = selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/[{}@;\\<>]/.test(part))
    .map((part) => (/^\.icon(?![\w-])/.test(part) ? scope + part.slice(5) : `${scope} ${part}`));
  const declarations = splitDeclarations(body)
    .map((part) => part.trim())
    .filter((part) => part.includes(':') && safeDeclaration(part));
  if (!selectors.length || !declarations.length) return '';
  return `${selectors.join(', ')} { ${declarations.join('; ')}; }`;
}

// Rewrites a pack stylesheet so `.icon` means one tile. At-rules, imports and non-data URLs are
// dropped; every other selector is nested under the scope.
export function scopeIconCss(source: string, scope: string): string {
  const css = source.slice(0, MAX_ICON_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: string[] = [];
  let depth = 0;
  let start = 0;
  let selectorStart = 0;
  let bodyStart = 0;
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === '{') {
      if (depth === 0) {
        selectorStart = start;
        bodyStart = index + 1;
      }
      depth++;
    } else if (char === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        const selector = css.slice(selectorStart, bodyStart - 1).trim();
        if (!selector.startsWith('@')) {
          const rule = buildRule(selector, css.slice(bodyStart, index), scope);
          if (rule) rules.push(rule);
        }
        start = index + 1;
      }
    } else if (char === ';' && depth === 0) start = index + 1;
  }
  return rules.join('\n');
}

const decoder = new TextDecoder();

// Builds a pack from unzipped entries. A single top-level folder around pack.json is tolerated.
export function parsePack(
  id: string,
  files: Record<string, Uint8Array>,
  options: { strict?: boolean } = {},
): IconPack {
  if (!validPackId(id)) throw new Error(`Invalid pack id "${id}".`);
  let prefix = '';
  if (!files['pack.json']) {
    const nested = Object.keys(files).find((name) => /^[^/]+\/pack\.json$/.test(name));
    if (!nested) throw new Error('The pack has no pack.json.');
    prefix = nested.slice(0, -'pack.json'.length);
  }
  const file = (name: string) => files[prefix + name];
  let manifest: PackManifest;
  try {
    manifest = parseManifest(JSON.parse(decoder.decode(file('pack.json'))));
  } catch (error) {
    throw error instanceof SyntaxError ? new Error('pack.json is not valid JSON.') : error;
  }
  const icons: PackIcon[] = [];
  for (const meta of manifest.icons) {
    const found = Object.entries(iconFileTypes)
      .map(([extension, type]) => ({ type, data: file(`icons/${meta.slug}/icon.${extension}`) }))
      .find((candidate) => candidate.data && candidate.data.length);
    if (!found) {
      if (options.strict)
        throw new Error(`Icon "${meta.slug}" has no icons/${meta.slug}/icon.* file.`);
      continue;
    }
    if (found.data!.length > MAX_ICON_FILE_BYTES) {
      if (options.strict) throw new Error(`Icon "${meta.slug}" is larger than 1 MiB.`);
      continue;
    }
    const styles = file(`icons/${meta.slug}/style.css`);
    const data = new ArrayBuffer(found.data!.byteLength);
    new Uint8Array(data).set(found.data!);
    icons.push({
      meta,
      type: found.type,
      data,
      css: styles ? decoder.decode(styles).slice(0, MAX_ICON_CSS) : '',
    });
  }
  if (!icons.length) throw new Error('The pack has no icon files.');
  return {
    id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    icons,
  };
}

const patterns = new Map<string, RegExp | null>();
function matches(pattern: string, subject: string): boolean {
  let regex = patterns.get(pattern);
  if (regex === undefined) {
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      regex = null;
    }
    patterns.set(pattern, regex);
  }
  return !!regex && regex.test(subject);
}

export function findIcon(
  packs: IconPack[],
  ref: string,
): { pack: IconPack; icon: PackIcon } | undefined {
  const parsed = parseIconRef(ref);
  if (!parsed) return undefined;
  const pack = packs.find((candidate) => candidate.id === parsed.packId);
  const icon = pack?.icons.find((candidate) => candidate.meta.slug === parsed.slug);
  return pack && icon ? { pack, icon } : undefined;
}

// Override first, then exact app ids, then match patterns; packs are tried in id order.
export function resolveAppIcon(
  app: { id: string; title: string },
  packs: IconPack[],
  overrides: Record<string, string>,
): { pack: IconPack; icon: PackIcon } | undefined {
  const override = overrides[app.id];
  if (override === 'tv') return undefined;
  if (override) {
    const chosen = findIcon(packs, override);
    if (chosen) return chosen;
  }
  for (const pack of packs)
    for (const icon of pack.icons)
      if (icon.meta.kind === 'tile' && icon.meta.apps.includes(app.id)) return { pack, icon };
  const subject = `${app.id} ${app.title}`;
  for (const pack of packs)
    for (const icon of pack.icons)
      if (icon.meta.kind === 'tile' && icon.meta.match && matches(icon.meta.match, subject))
        return { pack, icon };
  return undefined;
}

// Inputs use the user's choice, then any pack icon that lists the input id.
export function resolveInputIcon(
  inputId: string,
  packs: IconPack[],
  overrides: Record<string, string>,
): { pack: IconPack; icon: PackIcon } | undefined {
  const override = overrides[inputId];
  if (override) {
    const chosen = findIcon(packs, override);
    if (chosen) return chosen;
  }
  for (const pack of packs)
    for (const icon of pack.icons) if (icon.meta.inputs.includes(inputId)) return { pack, icon };
  return undefined;
}
