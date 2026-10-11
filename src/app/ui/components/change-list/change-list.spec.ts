import { changeLetter } from './change-list';

describe('changeLetter', () => {
  it('names each change by one letter, in either of the service’s spellings', () => {
    expect(['ADDED', 'MODIFY', 'DELETED', 'RENAMED', 'COPY'].map(changeLetter)).toEqual([
      'A',
      'M',
      'D',
      'R',
      'C',
    ]);
    expect(changeLetter('TYPE_CHANGED')).toBe('T');
    expect(changeLetter(undefined)).toBe('?');
  });
});
