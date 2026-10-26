import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import extras from '../tools/feed-extras.json' with { type: 'json' };
import { buildFeed, validateExtras } from '../tools/feed.mjs';

const own = {
  id: 'com.dezik.lumios',
  title: 'LumiOS',
  iconUri: 'https://x/icon.png',
  manifest: {},
};
const extra = {
  id: 'com.dezik.offtherecord',
  title: 'Off the Record',
  iconUri: 'https://x/otr.png',
  manifestUrl: 'https://x/otr.manifest.json',
};

describe('Homebrew feed', () => {
  it('lists LumiOS first, then the extra apps, and counts them', () => {
    const feed = buildFeed(own, [extra]);
    assert.deepEqual(
      feed.packages.map((p: { id: string }) => p.id),
      ['com.dezik.lumios', 'com.dezik.offtherecord'],
    );
    assert.deepEqual(feed.paging, { page: 1, count: 2, maxPage: 1, itemsTotal: 2 });
  });

  it('keeps only the fields Homebrew Channel reads for a linked manifest', () => {
    const [, linked] = buildFeed(own, [{ ...extra, note: 'internal' }]).packages;
    assert.deepEqual(Object.keys(linked).sort(), ['iconUri', 'id', 'manifestUrl', 'title']);
  });

  it('refuses an extra that would shadow LumiOS or repeat an app', () => {
    assert.throws(() => validateExtras([{ ...extra, id: own.id }], own.id), /Duplicate/);
    assert.throws(() => validateExtras([extra, extra], own.id), /Duplicate/);
  });

  it('refuses a plain-http or missing manifest link', () => {
    assert.throws(
      () => validateExtras([{ ...extra, manifestUrl: 'http://x/m.json' }], own.id),
      /https manifestUrl/,
    );
    assert.throws(
      () => validateExtras([{ ...extra, iconUri: undefined }], own.id),
      /https iconUri/,
    );
  });

  it('accepts the extras the repository ships', () => {
    assert.equal(validateExtras(extras, own.id).length, extras.length);
  });
});
