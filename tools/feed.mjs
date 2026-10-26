// The Homebrew Channel feed: LumiOS itself, with its manifest inline, plus apps
// from other repositories listed in feed-extras.json. Those carry a manifestUrl
// instead, which Homebrew Channel fetches when it opens the app's page, so their
// releases show up without a new LumiOS release.
const ID = /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/;

export function validateExtras(extras, ownId) {
  if (!Array.isArray(extras)) throw new Error('feed-extras.json must be a list.');
  const seen = new Set([ownId]);
  for (const extra of extras) {
    if (!extra || typeof extra !== 'object') throw new Error('Each feed extra must be an object.');
    if (!ID.test(extra.id ?? '')) throw new Error(`Invalid app id in feed extras: ${extra.id}`);
    if (seen.has(extra.id)) throw new Error(`Duplicate app id in the feed: ${extra.id}`);
    seen.add(extra.id);
    if (typeof extra.title !== 'string' || !extra.title.trim())
      throw new Error(`Feed extra ${extra.id} needs a title.`);
    for (const field of ['iconUri', 'manifestUrl']) {
      if (!/^https:\/\/\S+$/.test(extra[field] ?? ''))
        throw new Error(`Feed extra ${extra.id} needs an https ${field}.`);
    }
  }
  return extras.map(({ id, title, iconUri, manifestUrl }) => ({ id, title, iconUri, manifestUrl }));
}

export function buildFeed(ownPackage, extras) {
  const packages = [ownPackage, ...validateExtras(extras, ownPackage.id)];
  return {
    paging: { page: 1, count: packages.length, maxPage: 1, itemsTotal: packages.length },
    packages,
  };
}
