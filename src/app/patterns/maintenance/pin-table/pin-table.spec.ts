import { maintenanceGoldenMaster } from '../../../../testing/golden-masters';
import { pinTables, transitivesCaption } from './pin-table';

/**
 * The repository page's pin tables (qits-2334), from qits-maintenance's recording "a repository
 * with pins and bumps": internal, external, REACTOR and UNRESOLVED pins, two pending, and two
 * transitives through an internal pin, one behind. The page's own spec draws them.
 */
describe('pinTables', () => {
  const repository = maintenanceGoldenMaster('a repository with pins and bumps', 'getRepository');

  it('splits the pins by kind, pending first, and counts the transitives each brings in', () => {
    const tables = pinTables(repository);
    expect(tables.internal.pins.map((pin) => pin.name)).toEqual([
      'eu.wohlben.qits:qits-eventstream',
      'eu.wohlben.qits:qits-arch-rules',
    ]);
    expect(tables.external.pins.map((pin) => pin.pending)).toEqual([true, false]);
    expect(tables.other.pins.map((pin) => pin.kind).sort()).toEqual(['REACTOR', 'UNRESOLVED']);
    expect(tables.internal.transitives).toBe(2);
    expect(tables.internal.behind.map((t) => t.name)).toEqual([
      'com.fasterxml.jackson.core:jackson-databind',
    ]);
    expect(transitivesCaption(tables.internal)).toBe('2 transitives, 1 behind');
    expect(transitivesCaption({ pins: [], transitives: 1, behind: [] })).toBe(
      '1 transitive, 0 behind',
    );
  });

  it('counts a transitive through no known pin with the rest', () => {
    const tables = pinTables({
      pins: [],
      transitives: [{ name: 'x', via: 'gone', behind: true }],
    });
    expect(tables.other.transitives).toBe(1);
    expect(tables.other.behind).toHaveLength(1);
  });
});
