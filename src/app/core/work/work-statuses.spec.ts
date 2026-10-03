import { BOARD_COLUMNS } from './work-statuses';

describe('board columns', () => {
  it('lists the working statuses left to right, each in its own colour', () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual(['REFINED', 'IMPLEMENTED', 'VERIFIED']);
    expect(new Set(BOARD_COLUMNS.map((c) => c.body)).size).toBe(3);
  });
});
