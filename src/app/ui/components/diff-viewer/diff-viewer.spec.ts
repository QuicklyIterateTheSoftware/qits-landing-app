import { diffLineKind, diffLines } from './diff-viewer';

describe('diff lines', () => {
  it('tells added, removed, hunk, meta and context lines apart', () => {
    expect(
      [
        '@@ -1 +1 @@',
        '+++ b/x',
        '--- a/x',
        '+new',
        '-old',
        'diff --git a b',
        '\\ No newline',
        ' same',
      ].map(diffLineKind),
    ).toEqual(['hunk', 'meta', 'meta', 'add', 'del', 'meta', 'meta', 'context']);
  });

  it('drops the empty line a trailing newline leaves, and reads an empty patch as none', () => {
    expect(diffLines('+a\n b\n').map((line) => line.text)).toEqual(['+a', ' b']);
    expect(diffLines('')).toEqual([]);
  });
});
