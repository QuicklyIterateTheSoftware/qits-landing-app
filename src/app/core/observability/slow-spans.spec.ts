import { floorText, formatSpanDuration, thresholdLabel } from './slow-spans';

describe('slow-spans', () => {
  it('labels each floor, zero as any duration', () => {
    expect([500, 1000, 100, 10, 0].map(thresholdLabel)).toEqual([
      '500 ms or slower',
      '1 s or slower',
      '100 ms or slower',
      '10 ms or slower',
      'Any duration',
    ]);
    expect(floorText(2000)).toBe('2 s');
  });

  it('draws a duration in ms under a second, else seconds with one decimal', () => {
    expect(formatSpanDuration(750)).toBe('750 ms');
    expect(formatSpanDuration(0)).toBe('0 ms');
    expect(formatSpanDuration(12.345)).toBe('12.3 ms');
    expect(formatSpanDuration(999)).toBe('999 ms');
    expect(formatSpanDuration(1000)).toBe('1.0 s');
    expect(formatSpanDuration(1250)).toBe('1.3 s');
    expect(formatSpanDuration(61_000)).toBe('61.0 s');
    expect(formatSpanDuration(undefined)).toBe('');
  });
});
