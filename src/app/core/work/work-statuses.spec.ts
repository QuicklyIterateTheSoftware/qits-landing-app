import { BOARD_COLUMNS } from './work-statuses';

describe('board columns', () => {
  it('lists the working statuses left to right, Ready for Dev first, each in its own colour', () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual([
      'READY_FOR_DEV',
      'IMPLEMENTING',
      'IMPLEMENTED',
      'VERIFYING',
    ]);
    expect(new Set(BOARD_COLUMNS.map((c) => c.body)).size).toBe(4);
    expect(BOARD_COLUMNS[0].label).toBe('Ready for Dev');
  });
});
