import {
  formatBytes,
  itemNoun,
  listingOf,
  metadataLine,
  newestPublishFirst,
  newestPushFirst,
  orphanSbomCount,
  plural,
  publishedFrom,
  sbomsByVersion,
  searched,
  shortDigest,
  sortedFiles,
  splitCoordinate,
  splitPackageName,
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

  it('splits a coordinate into its groupId and artifactId (qits-2325)', () => {
    expect(splitCoordinate('eu.wohlben.qits:contract-maven')).toEqual({
      groupId: 'eu.wohlben.qits',
      artifactId: 'contract-maven',
    });
    expect(splitCoordinate('bare')).toEqual({ groupId: '', artifactId: 'bare' });
  });

  it('splits a scoped npm name into its scope and its own name (qits-2326)', () => {
    expect(splitPackageName('@contract/contract-scoped')).toEqual({
      scope: '@contract',
      name: 'contract-scoped',
    });
    expect(splitPackageName('contract-package')).toEqual({ scope: '', name: 'contract-package' });
  });

  it('orders versions newest publish first, then the higher version, one without a publish last', () => {
    const versions = [
      { version: '2100.9.0', publishedAt: '2026-01-01T00:00:00Z' },
      { version: 'old' },
      { version: '2100.1.0', publishedAt: '2026-02-01T00:00:00Z' },
      { version: '2100.10.0', publishedAt: '2026-01-01T00:00:00Z' },
    ];
    expect(newestPublishFirst(versions).map((v) => v.version)).toEqual([
      '2100.1.0',
      '2100.10.0',
      '2100.9.0',
      'old',
    ]);
    expect(versions[0].version).toBe('2100.9.0');
    // An npm version whose publish was not recorded answers null (qits-2326): last too.
    const npm = [
      { version: '1.0.0', publishedAt: null },
      { version: '2.0.0', publishedAt: '2026-01-01T00:00:00Z' },
    ];
    expect(newestPublishFirst(npm).map((v) => v.version)).toEqual(['2.0.0', '1.0.0']);
  });

  it('sorts file names, whichever order the store answers them in', () => {
    const files = ['x-1.pom', 'x-1.jar'];
    expect(sortedFiles(files)).toEqual(['x-1.jar', 'x-1.pom']);
    expect(files[0]).toBe('x-1.pom');
    expect(sortedFiles(undefined)).toEqual([]);
  });

  it('joins SBOMs to versions, and counts those whose version is gone', () => {
    const sboms = [{ version: '3' }, { version: '2' }, {}];
    expect([...sbomsByVersion(sboms).keys()]).toEqual(['3', '2']);
    expect(orphanSbomCount(sboms.slice(0, 2), [{ version: '2' }, { version: '1' }])).toBe(1);
    expect(orphanSbomCount([], [{ version: '1' }])).toBe(0);
  });
});
