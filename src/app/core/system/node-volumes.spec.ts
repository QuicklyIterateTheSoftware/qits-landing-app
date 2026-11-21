import {
  ANONYMOUS_VOLUME_LABEL,
  isAnonymousVolume,
  shortVolumeName,
  volumeLabelPairs,
} from './node-volumes';

describe('node volumes (qits-2355)', () => {
  it('calls a volume anonymous by docker’s label key, whatever its value', () => {
    expect(isAnonymousVolume({ labels: { [ANONYMOUS_VOLUME_LABEL]: '' } })).toBe(true);
    expect(isAnonymousVolume({ labels: { [ANONYMOUS_VOLUME_LABEL]: 'x', a: 'b' } })).toBe(true);
    expect(isAnonymousVolume({ labels: { 'qits.system.runner': 'r' } })).toBe(false);
    expect(isAnonymousVolume({ labels: {} })).toBe(false);
    expect(isAnonymousVolume({})).toBe(false);
  });

  it('draws the labels as key=value sorted by key, without the anonymous marker', () => {
    expect(
      volumeLabelPairs({
        'qits.system.runner.work-key': 'ws-10207',
        [ANONYMOUS_VOLUME_LABEL]: '',
        'qits.system.runner': 'd2616b57',
      }),
    ).toEqual(['qits.system.runner=d2616b57', 'qits.system.runner.work-key=ws-10207']);
    expect(volumeLabelPairs({ [ANONYMOUS_VOLUME_LABEL]: '' })).toEqual([]);
    expect(volumeLabelPairs(undefined)).toEqual([]);
  });

  it('shortens a name to its first 12 characters', () => {
    expect(
      shortVolumeName('3f49f7508f534e3614ffc3bdd2c240800f208996d8ce4deb0f2dd9dd5e5e4dc0'),
    ).toBe('3f49f7508f53');
    expect(shortVolumeName('short')).toBe('short');
    expect(shortVolumeName(undefined)).toBe('');
  });
});
