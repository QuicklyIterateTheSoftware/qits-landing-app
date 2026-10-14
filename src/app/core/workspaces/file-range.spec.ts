import { formatRange, parseRange } from './file-range';

describe('line ranges', () => {
  it('prints one line alone and a span with a dash', () => {
    expect(formatRange({ startLine: 12, endLine: 12 })).toBe('12');
    expect(formatRange({ startLine: 12, endLine: 20 })).toBe('12-20');
  });

  it('reads what it prints', () => {
    expect(parseRange('12')).toEqual({ startLine: 12, endLine: 12 });
    expect(parseRange(' 12-20 ')).toEqual({ startLine: 12, endLine: 20 });
  });

  it('reads anything malformed as no anchor', () => {
    expect(parseRange(null)).toBeNull();
    expect(parseRange('')).toBeNull();
    expect(parseRange('0')).toBeNull();
    expect(parseRange('20-12')).toBeNull();
    expect(parseRange('12-')).toBeNull();
    expect(parseRange('twelve')).toBeNull();
  });
});
