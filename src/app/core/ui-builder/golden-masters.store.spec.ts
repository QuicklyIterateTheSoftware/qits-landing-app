import { safeRecordedFile } from './golden-masters.store';

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
