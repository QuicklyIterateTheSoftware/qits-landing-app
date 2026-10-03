import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HIGHLIGHT_FADE_MS,
  HIGHLIGHT_MS,
  Highlighter,
  SelectionHighlight,
  targetOf,
} from './highlight';

/** A list of two cards, one with a nested row; the selection listener on the list. */
@Component({
  imports: [SelectionHighlight],
  template: `
    <section uiSelectionHighlight>
      <div id="a" data-highlight-target><span id="a-text">First card</span></div>
      <div id="b" data-highlight-target>
        <div id="b-row" data-highlight-target><span id="row-text">A row</span></div>
      </div>
      <p id="loose">Not on a card</p>
    </section>
  `,
})
class Host {}

describe('Highlighter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('outlines the element, fades it after a while, then takes the outline off', () => {
    const highlighter = TestBed.inject(Highlighter);
    const element = document.createElement('div');
    highlighter.highlight(element);
    expect(element.classList.contains('outline-ocean-deep-600')).toBe(true);
    vi.advanceTimersByTime(HIGHLIGHT_MS);
    expect(element.classList.contains('outline-ocean-deep-600')).toBe(false);
    expect(element.classList.contains('outline-transparent')).toBe(true);
    vi.advanceTimersByTime(HIGHLIGHT_FADE_MS);
    expect(element.className).toBe('');
    expect(highlighter.highlighted).toBeUndefined();
  });

  it('takes the highlight off the previous element', () => {
    const highlighter = TestBed.inject(Highlighter);
    const [first, second] = [document.createElement('div'), document.createElement('div')];
    highlighter.highlight(first);
    highlighter.highlight(second);
    expect(first.className).toBe('');
    expect(highlighter.highlighted).toBe(second);
  });
});

describe('SelectionHighlight', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byId = (id: string) => element.querySelector(`#${id}`) as HTMLElement;
    const directive = fixture.debugElement.children[0].injector.get(SelectionHighlight);
    return { element, byId, directive, highlighter: TestBed.inject(Highlighter) };
  }

  afterEach(() => TestBed.inject(Highlighter).clear());

  it('finds the innermost card that holds a node, inside the board only', () => {
    const { element, byId } = render();
    expect(targetOf(byId('a-text').firstChild, element)).toBe(byId('a'));
    expect(targetOf(byId('row-text'), element)).toBe(byId('b-row'));
    expect(targetOf(byId('loose'), element)).toBeUndefined();
    expect(targetOf(byId('a'), byId('b'))).toBeUndefined();
  });

  it('highlights the card the selection starts in, and moves with it', () => {
    const { byId, directive, highlighter } = render();
    directive.select(byId('a-text').firstChild);
    expect(highlighter.highlighted).toBe(byId('a'));
    directive.select(byId('row-text').firstChild);
    expect(highlighter.highlighted).toBe(byId('b-row'));
    expect(byId('a').className).toBe('');
  });

  it('listens to the document’s selectionchange', () => {
    const { byId, highlighter } = render();
    const range = document.createRange();
    range.selectNodeContents(byId('a-text'));
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    expect(highlighter.highlighted).toBe(byId('a'));
    selection.removeAllRanges();
  });
});
