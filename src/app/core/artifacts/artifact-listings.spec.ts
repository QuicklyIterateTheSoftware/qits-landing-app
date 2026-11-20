import {
  formatBytes,
  itemNoun,
  listingOf,
  metadataLine,
  newestPushFirst,
  oldDetailHref,
  plural,
  publishedFrom,
  searched,
  shortDigest,
  untaggedCount,
} from './artifact-listings';

describe('artifact listings (qits-2316)', () => {
  it.each([
    ['oci-images', 'images'],
    ['npm-packages', 'npm'],
    ['maven-packages', 'maven'],
    ['daemon-binaries', 'daemons'],
    ['docs', 'docs'],
    ['ci-screenshots', 'records'],
    ['ci-videos', 'records'],
    ['sboms', undefined],
    [undefined, undefined],
  ])('reads %s through the %s listing', (type, kind) => {
    expect(listingOf(type)).toBe(kind);
  });

  it('links a row to its page in the old explorer, the name one segment', () => {
    const origin = 'https://registry.example.test';
    expect(oldDetailHref(origin, 'npm', 'npm', '@qits/angular')).toBe(
      'https://registry.example.test/repositories/npm/packages/%40qits%2Fangular',
    );
    expect(oldDetailHref(origin, 'maven', 'maven', 'eu.wohlben.qits:x')).toBe(
      'https://registry.example.test/repositories/maven/maven-packages/eu.wohlben.qits%3Ax',
    );
    expect(oldDetailHref('', 'qits', 'images', 'x')).toBe('');
    // An image opens this app's own image page (qits-2324), not the old explorer's.
    expect(oldDetailHref(origin, 'qits', 'images', 'x')).toBe('');
    // A daemon opens this app's own daemon page (qits-2327), not the old explorer's.
    expect(oldDetailHref(origin, 'daemons', 'daemons', 'x')).toBe('');
    // A docs site opens this app's own docs site page (qits-2328), not the old explorer's.
    expect(oldDetailHref(origin, 'docs', 'docs', '@routes/qits-landing')).toBe('');
    expect(oldDetailHref(origin, 'ci-videos', 'records', 'x')).toBe('');
  });

  it('counts with the noun the type counts, and sizes in binary units', () => {
    expect(plural(46, itemNoun('oci-images'))).toBe('46 images');
    expect(plural(1, itemNoun('maven-packages'))).toBe('1 file');
    expect(plural(undefined, itemNoun('docs'))).toBe('0 versions');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(2636)).toBe('2.57 KiB');
    expect(formatBytes(4.04 * 1024 ** 3)).toBe('4.04 GiB');
    expect(formatBytes(undefined)).toBe('not measured');
  });

  it('narrows rows by name, in any case, and keeps them all for an empty search', () => {
    const rows = [{ name: 'qits-ci' }, { name: 'qits-projects' }];
    expect(searched(rows, ' CI ', (row) => row.name)).toEqual([{ name: 'qits-ci' }]);
    expect(searched(rows, '', (row) => row.name)).toBe(rows);
  });

  it('writes a record’s metadata as key=value pairs', () => {
    expect(metadataLine({ branch: 'main', sha: 'abc' })).toBe('branch=main · sha=abc');
    expect(metadataLine(undefined)).toBe('—');
  });

  it('says where a docs version came from, with the keys it carries (qits-2328)', () => {
    expect(
      publishedFrom({
        'git.repository.name': 'qits-projects-service',
        'git.commit.hash': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'release.request.qualified-id': 'qits-projects-service-rr-535',
      }),
    ).toBe('qits-projects-service · aaaaaaa · qits-projects-service-rr-535');
    expect(
      publishedFrom({
        'git.repository.name': 'qits-qits',
        'git.branch.name': 'main',
        'git.commit.hash': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'content.hash': 'x',
      }),
    ).toBe('qits-qits · main · bbbbbbb');
    expect(publishedFrom({ 'content.hash': 'x' })).toBe('—');
    expect(publishedFrom(undefined)).toBe('—');
  });

  it('shortens a digest to its algorithm and 12 hex characters (qits-2324)', () => {
    expect(
      shortDigest('sha256:1b91a3dfff59dad5c1d9c7e557ca94e67e96aabad34050385263cffe926ed7a2'),
    ).toBe('sha256:1b91a3dfff59');
    expect(shortDigest('1b91a3dfff59dad5c1d9')).toBe('1b91a3dfff59');
    expect(shortDigest(undefined)).toBe('—');
  });

  it('orders tags newest push first, then by name, a tag without a push last', () => {
    const tags = [
      { tag: 'b', createdAt: '2026-01-01T00:00:00Z' },
      { tag: 'old' },
      { tag: 'new', createdAt: '2026-02-01T00:00:00Z' },
      { tag: 'a', createdAt: '2026-01-01T00:00:00Z' },
    ];
    expect(newestPushFirst(tags).map((t) => t.tag)).toEqual(['new', 'a', 'b', 'old']);
    expect(tags[0].tag).toBe('b');
  });

  it('counts the manifests no tag names', () => {
    expect(untaggedCount([{ tags: ['2100.1.0'] }, { tags: [] }, {}])).toBe(2);
    expect(untaggedCount([])).toBe(0);
  });
});
