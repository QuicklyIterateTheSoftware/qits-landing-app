import { goldenMaster } from '../../../testing/golden-masters';
import type { WorkEntry } from '../projects/projects.consumes';
import { ARCHIVE_STATUSES, BACKLOG_STATUSES, BOARD_COLUMNS, withStatus } from './work-statuses';

/** qits-projects' recording: 3 REFINED (an epic, two tickets), 1 REPORTED, 1 DONE. */
const entries = (): readonly WorkEntry[] =>
  goldenMaster('a project with refined work', 'listProjectEntities').entities;

const titles = (list: readonly WorkEntry[]) => list.map((entry) => entry.title);

describe('work statuses', () => {
  it('puts the working statuses on the board, left to right', () => {
    expect(BOARD_COLUMNS.map((column) => column.status)).toEqual([
      'REFINED',
      'IMPLEMENTED',
      'VERIFIED',
    ]);
    expect(titles(withStatus(entries(), ['REFINED']))).toEqual([
      'Refined epic',
      'Refined ticket',
      'Second refined ticket',
    ]);
    expect(withStatus(entries(), ['IMPLEMENTED'])).toEqual([]);
  });

  it('keeps work not refined yet in the backlog', () => {
    expect(titles(withStatus(entries(), BACKLOG_STATUSES))).toEqual(['Reported ticket']);
  });

  it('archives the final states only', () => {
    expect(titles(withStatus(entries(), ARCHIVE_STATUSES))).toEqual(['Done ticket']);
  });

  it('places an entity without a status nowhere (features and tasks)', () => {
    // Derived from the recording: its first entity without a status, as a feature has.
    const { status: _, ...feature } = entries()[0];
    const every = [...BOARD_COLUMNS.map((c) => c.status), ...BACKLOG_STATUSES, ...ARCHIVE_STATUSES];
    expect(withStatus([feature], every)).toEqual([]);
  });
});
