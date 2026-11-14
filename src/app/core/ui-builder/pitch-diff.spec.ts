import {
  applyDiff,
  clearDiff,
  DIFF_ATTRIBUTE,
  diffCss,
  diffPitch,
  type PitchDiff,
} from './pitch-diff';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** `diffPitch` over the body markup of two parsed documents, keeping the pitch doc to query marks on. */
function diff(originalHtml: string, pitchHtml: string): { diff: PitchDiff; pitch: Document } {
  const pitch = parse(pitchHtml);
  return { diff: diffPitch(parse(originalHtml), pitch), pitch };
}

describe('diffPitch (qits-2158)', () => {
  it('marks every element of an identical pitch same, nothing removed, body itself unmarked', () => {
    const html = '<div id="a"><p>Hello</p><span>World</span></div>';
    const { diff: d, pitch } = diff(html, html);
    expect(d.removed).toEqual([]);
    expect(d.marks.size).toBe(3);
    for (const element of [
      pitch.getElementById('a'),
      pitch.querySelector('p'),
      pitch.querySelector('span'),
    ]) {
      expect(d.marks.get(element!)).toBe('same');
    }
    expect(d.marks.has(pitch.body)).toBe(false);
  });

  it('marks a node with changed text changed, its siblings same', () => {
    const { diff: d, pitch } = diff(
      '<ul><li id="a">One</li><li id="b">Two</li></ul>',
      '<ul><li id="a">One</li><li id="b">Two changed</li></ul>',
    );
    expect(d.marks.get(pitch.querySelector('ul')!)).toBe('same');
    expect(d.marks.get(pitch.getElementById('a')!)).toBe('same');
    expect(d.marks.get(pitch.getElementById('b')!)).toBe('changed');
    expect(d.removed).toEqual([]);
  });

  it('marks a node with a changed attribute changed', () => {
    const { diff: d, pitch } = diff(
      '<div id="x" data-foo="1"></div>',
      '<div id="x" data-foo="2"></div>',
    );
    expect(d.marks.get(pitch.getElementById('x')!)).toBe('changed');
  });

  it('ignores class token order', () => {
    const { diff: d, pitch } = diff('<div class="a b c"></div>', '<div class="c a b"></div>');
    expect(d.marks.get(pitch.querySelector('div')!)).toBe('same');
  });

  it('ignores differing Angular-generated _ngcontent/_nghost attributes', () => {
    const { diff: d, pitch } = diff(
      '<div _ngcontent-ng-c111=""></div>',
      '<div _ngcontent-ng-c123=""></div>',
    );
    expect(d.marks.get(pitch.querySelector('div')!)).toBe('same');
    const { diff: d2, pitch: pitch2 } = diff(
      '<span _nghost-ng-c1=""></span>',
      '<span _nghost-ng-c2=""></span>',
    );
    expect(d2.marks.get(pitch2.querySelector('span')!)).toBe('same');
  });

  it('ignores a data-qits-builder* attribute present only in the pitch', () => {
    const { diff: d, pitch } = diff(
      '<div></div>',
      '<div data-qits-builder-highlight="true"></div>',
    );
    expect(d.marks.get(pitch.querySelector('div')!)).toBe('same');
  });

  it('marks an inserted sibling and its children added, leaving the rest same', () => {
    const { diff: d, pitch } = diff(
      '<ul><li id="a">A</li></ul>',
      '<ul><li id="a">A</li><li id="b">B<span>x</span></li></ul>',
    );
    expect(d.marks.get(pitch.querySelector('ul')!)).toBe('same');
    expect(d.marks.get(pitch.getElementById('a')!)).toBe('same');
    expect(d.marks.get(pitch.getElementById('b')!)).toBe('added');
    expect(d.marks.get(pitch.querySelector('span')!)).toBe('added');
    expect(d.removed).toEqual([]);
  });

  it('lists a removed sibling once, its tag and collapsed text, not its subtree', () => {
    const { diff: d } = diff(
      '<ul><li id="a">A</li><li>  Hello   <b>World</b>  </li></ul>',
      '<ul><li id="a">A</li></ul>',
    );
    expect(d.removed).toEqual([{ tag: 'li', text: 'Hello World' }]);
  });

  it('cuts removed text to 80 characters with an ellipsis when longer', () => {
    const long = 'x'.repeat(100);
    const { diff: d } = diff(`<ul><li>${long}</li></ul>`, '<ul></ul>');
    expect(d.removed).toEqual([{ tag: 'li', text: `${'x'.repeat(80)}…` }]);
  });

  it('leaves text exactly 80 characters long alone', () => {
    const exact = 'y'.repeat(80);
    const { diff: d } = diff(`<ul><li>${exact}</li></ul>`, '<ul></ul>');
    expect(d.removed).toEqual([{ tag: 'li', text: exact }]);
  });

  it('takes no part in the diff for script, style and template children', () => {
    const { diff: d, pitch } = diff(
      '<div><script>var x=1;</script><style>.a{color:red}</style><template><p>t</p></template><p>Hi</p></div>',
      '<div><script>var y=2;</script><style>.b{color:blue}</style><template><p>t2</p></template><p>Hi</p></div>',
    );
    expect(d.marks.has(pitch.querySelector('script')!)).toBe(false);
    expect(d.marks.has(pitch.querySelector('style')!)).toBe(false);
    expect(d.marks.has(pitch.querySelector('template')!)).toBe(false);
    expect(d.marks.get(pitch.querySelector('p')!)).toBe('same');
    expect(d.removed).toEqual([]);
  });
});

describe('diffPitch: empty class and style (qits-2158)', () => {
  it('reads an empty style or class as none, as a rendered frame writes style="" when touched', () => {
    const { diff: d, pitch } = diff(
      '<input type="radio" name="t" checked><p class="a">A</p>',
      '<input type="radio" name="t" checked style=""><p class="a">A</p><span class="">S</span>',
    );
    expect(d.marks.get(pitch.querySelector('input')!)).toBe('same');
    expect(d.marks.get(pitch.querySelector('p')!)).toBe('same');
    expect(d.marks.get(pitch.querySelector('span')!)).toBe('added');
  });
});

describe('applyDiff and clearDiff (qits-2158)', () => {
  it('sets DIFF_ATTRIBUTE to each element’s mark, and clearDiff removes it', () => {
    const { diff: d, pitch } = diff(
      '<ul><li id="a">A</li></ul>',
      '<ul><li id="a">A changed</li><li id="b">B</li></ul>',
    );
    applyDiff(d);
    // The ul is unchanged but holds changes, so it is left undimmed: dimming it would dim them too.
    expect(pitch.querySelector('ul')!.hasAttribute(DIFF_ATTRIBUTE)).toBe(false);
    expect(pitch.getElementById('a')!.getAttribute(DIFF_ATTRIBUTE)).toBe('changed');
    expect(pitch.getElementById('b')!.getAttribute(DIFF_ATTRIBUTE)).toBe('added');

    clearDiff(pitch);
    expect(pitch.querySelector(`[${DIFF_ATTRIBUTE}]`)).toBeNull();
  });

  it('dims only the top of a wholly unchanged subtree', () => {
    const html = '<section><ul><li>A</li><li>B</li></ul><p>Old</p></section>';
    const { diff: d, pitch } = diff(html, html.replace('Old', 'New'));
    applyDiff(d);
    expect(pitch.querySelector('section')!.hasAttribute(DIFF_ATTRIBUTE)).toBe(false);
    expect(pitch.querySelector('ul')!.getAttribute(DIFF_ATTRIBUTE)).toBe('same');
    expect(pitch.querySelectorAll(`li[${DIFF_ATTRIBUTE}]`).length).toBe(0);
    expect(pitch.querySelector('p')!.getAttribute(DIFF_ATTRIBUTE)).toBe('changed');
  });
});

describe('diffCss (qits-2158)', () => {
  it('includes the given accent', () => {
    const css = diffCss('#ff00ff');
    expect(css).toContain('#ff00ff');
    expect(css).toContain(`[${DIFF_ATTRIBUTE}='same']`);
    expect(css).toContain(`[${DIFF_ATTRIBUTE}='changed']`);
    expect(css).toContain(`[${DIFF_ATTRIBUTE}='added']`);
  });
});
