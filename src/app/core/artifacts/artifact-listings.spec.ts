import {
  formatBytes,
  itemNoun,
  listingOf,
  metadataLine,
  oldDetailHref,
  plural,
  searched,
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
    expect(oldDetailHref(origin, 'docs', 'docs', '@routes/qits-landing')).toBe(
      'https://registry.example.test/repositories/docs/docs/%40routes%2Fqits-landing',
    );
    expect(oldDetailHref('', 'qits', 'images', 'x')).toBe('');
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
});
