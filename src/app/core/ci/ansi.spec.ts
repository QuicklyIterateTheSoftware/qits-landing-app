import { ansiSegments, stripAnsi } from './ansi';

const ESC = '\u001b';

describe('ansiSegments', () => {
  it('keeps text without escapes as one plain segment', () => {
    expect(ansiSegments('[INFO] BUILD SUCCESS\n')).toEqual([
      { text: '[INFO] BUILD SUCCESS\n', classes: '' },
    ]);
  });

  it('colours text by the eight colours and their bright forms, and resets', () => {
    expect(ansiSegments(`${ESC}[32mPASS${ESC}[0m one ${ESC}[91mFAIL${ESC}[39m two`)).toEqual([
      { text: 'PASS', classes: 'text-success' },
      { text: ' one ', classes: '' },
      { text: 'FAIL', classes: 'text-danger-strong' },
      { text: ' two', classes: '' },
    ]);
    const colours = [30, 31, 32, 33, 34, 35, 36, 37].map(
      (code) => ansiSegments(`${ESC}[${code}mx`)[0].classes,
    );
    expect(colours).toEqual([
      'text-fg-soft',
      'text-danger',
      'text-success',
      'text-warning',
      'text-code-type',
      'text-code-annotation',
      'text-accent-muted',
      'text-fg',
    ]);
    const bright = [90, 91, 92, 93, 94, 95, 96, 97].map(
      (code) => ansiSegments(`${ESC}[${code}mx`)[0].classes,
    );
    expect(bright).toEqual([
      'text-fg-muted',
      'text-danger-strong',
      'text-success-strong',
      'text-warning-strong',
      'text-accent',
      'text-code-keyword',
      'text-accent-muted',
      'text-fg',
    ]);
  });

  it('makes text bold, with a colour in the same sequence, until 22 or a reset', () => {
    expect(ansiSegments(`${ESC}[1;31mFAIL${ESC}[22m red${ESC}[m plain`)).toEqual([
      { text: 'FAIL', classes: 'text-danger font-semibold' },
      { text: ' red', classes: 'text-danger' },
      { text: ' plain', classes: '' },
    ]);
    expect(ansiSegments(`${ESC}[1mTests run: 128${ESC}[0m\n`)).toEqual([
      { text: 'Tests run: 128', classes: 'font-semibold' },
      { text: '\n', classes: '' },
    ]);
  });

  it('drops every other escape, and reads past SGR parameters it does not draw', () => {
    expect(
      ansiSegments(
        `a${ESC}[2Kb${ESC}[1Ac${ESC}]0;title${ESC}\\d${ESC}]8;;https://x${ESC}\\e${ESC}(Bf${ESC}`,
      ),
    ).toEqual([{ text: 'abcdef', classes: '' }]);
    expect(ansiSegments(`${ESC}[4;44mu${ESC}[38;5;196mv${ESC}[38;2;1;2;3;32mw`)).toEqual([
      { text: 'uv', classes: '' },
      { text: 'w', classes: 'text-success' },
    ]);
  });

  it('keeps markup as text: nothing in the output is read as HTML', () => {
    const segments = ansiSegments(`${ESC}[31m<script>alert(1)</script>${ESC}[0m&amp;<b>`);
    expect(segments).toEqual([
      { text: '<script>alert(1)</script>', classes: 'text-danger' },
      { text: '&amp;<b>', classes: '' },
    ]);
  });

  it('strips the escapes for a plain reading', () => {
    expect(stripAnsi(`${ESC}[1;31mFAIL${ESC}[0m BillingIT`)).toBe('FAIL BillingIT');
  });
});
