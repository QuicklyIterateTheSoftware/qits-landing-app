import { projectsGoldenIndex } from '../../../testing/golden-masters';
import { asGoldenIndex, safeRecordedFile } from './golden-masters.store';

describe('safeRecordedFile', () => {
  it('takes a recorded file in its state’s directory', () => {
    expect(safeRecordedFile('a-commit-with-a-run-in-flight/listActiveRuns.json')).toBe(true);
    expect(safeRecordedFile('state_1/op.v2.json')).toBe(true);
  });

  it('refuses a path that could leave the golden-masters tree', () => {
    for (const file of [
      '../entities.json',
      'state/../../x.json',
      './op.json',
      'state/./op.json',
      '/etc/passwd',
      'state\\op.json',
      'state/%2e%2e/op.json',
      'state//op.json',
      '',
    ]) {
      expect(safeRecordedFile(file), file).toBe(false);
    }
  });
});

describe('asGoldenIndex', () => {
  it('takes qits-projects’ published index, a missing file reading as null', () => {
    const index = asGoldenIndex(projectsGoldenIndex());
    expect(index?.provider).toBe('qits-projects');
    expect(index?.states?.length).toBeGreaterThan(0);
    const ops = index!.states!.flatMap((s) => s.operations);
    expect(ops.some((op) => op.file === null)).toBe(true);
    expect(
      asGoldenIndex({
        states: [
          {
            name: 'a',
            slug: 'a',
            operations: [{ operationId: 'x', method: 'GET', path: '/x', status: 204 }],
          },
        ],
      })?.states?.[0].operations[0].file,
    ).toBeNull();
  });

  it('refuses anything else', () => {
    expect(asGoldenIndex(null)).toBeNull();
    expect(asGoldenIndex([])).toBeNull();
    expect(asGoldenIndex({})).toBeNull();
    expect(asGoldenIndex({ states: [{ name: 'a' }] })).toBeNull();
    expect(
      asGoldenIndex({
        states: [{ name: 'a', slug: 'a', operations: [{ operationId: 'x', status: 'ok' }] }],
      }),
    ).toBeNull();
  });
});
