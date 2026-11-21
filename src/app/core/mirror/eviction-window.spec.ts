import { evictionWindowWords } from './eviction-window';

describe('evictionWindowWords', () => {
  it('says a window of whole days in days', () => {
    expect(evictionWindowWords('P30D')).toBe('30 days');
    expect(evictionWindowWords('P90D')).toBe('90 days');
  });

  it('says one day in the singular', () => {
    expect(evictionWindowWords('P1D')).toBe('1 day');
  });

  it('shows any other duration as the server wrote it', () => {
    expect(evictionWindowWords('PT12H')).toBe('PT12H');
    expect(evictionWindowWords('P1M')).toBe('P1M');
    expect(evictionWindowWords('P1DT2H')).toBe('P1DT2H');
    expect(evictionWindowWords('')).toBe('');
  });
});
