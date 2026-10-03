import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Highlighter } from '$ui/components/highlight/highlight';
import { provideRouter } from '@angular/router';
import { Board, type BoardColumnSpec } from './board';
import { BoardCard } from './board-card';
import { BoardLane } from './board-lane';
import { BoardRow } from './board-row';

const COLUMNS: readonly BoardColumnSpec[] = [
  { label: 'One', count: 1, body: 'bg-ocean-deep-300', header: 'bg-ocean-deep-400' },
  { label: 'Two', body: 'bg-sunflower-gold-300', header: 'bg-sunflower-gold-400' },
  { label: 'Three', body: 'bg-mint-leaf-300', header: 'bg-mint-leaf-400' },
];

@Component({
  imports: [Board, BoardLane, BoardRow, BoardCard],
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane>
        <span lane-header>Lane</span>
        <span lane-gutter>L-1</span>
        <ui-board-row>
          <ui-board-card
            id="in-row"
            [column]="1"
            code="c-1"
            title="In two"
            kind="task"
            link="/x/c-1"
          />
          <span row-footer>Row</span>
        </ui-board-row>
        <ui-board-card id="in-lane" [column]="2" code="c-2" title="In three" kind="task" />
      </ui-board-lane>
      <ui-board-card id="on-board" [column]="0" code="c-0" title="In one" kind="ticket" />
    </ui-board>
  `,
})
class Host {
  readonly columns = COLUMNS;
}

@Component({
  imports: [BoardLane],
  template: `
    <ui-board-lane>
      <span lane-header>Off</span>
      <ui-board-lane muted><span lane-header>Nested</span></ui-board-lane>
    </ui-board-lane>
  `,
})
class OffBoard {}

@Component({
  imports: [Board, BoardLane, BoardRow],
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane collapsible [collapsed]="collapsed">
        <span lane-header>Lane</span>
        <span lane-summary>3 / 3 ✅</span>
        <ui-board-row><span row-footer>Row</span></ui-board-row>
      </ui-board-lane>
    </ui-board>
  `,
})
class Collapsible {
  readonly columns = COLUMNS;
  collapsed = false;
}

describe('Board', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws a gutter on each side, one heading and one colour stripe per column', () => {
    const element = render();
    const headings = [...element.querySelectorAll('ui-board > div:first-child > div')];
    expect(headings.map((h) => h.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '',
      'One 1',
      'Two',
      'Three',
      '',
    ]);
    const stripes = [...element.querySelectorAll('ui-board [aria-hidden="true"] > div')];
    expect(stripes.map((s) => s.className)).toEqual([
      '',
      'bg-ocean-deep-300',
      'bg-sunflower-gold-300',
      'bg-mint-leaf-300',
      '',
    ]);
  });

  it('runs a lane across the board, a row across the status columns, cards in their column', () => {
    const element = render();
    const column = (selector: string) =>
      (element.querySelector(selector) as HTMLElement).style.gridColumn;
    expect(column('ui-board-lane')).toBe('1 / -1');
    expect(column('ui-board-row')).toBe('2 / span 3');
    // Status column 1, inside a row whose grid starts at status column 0: its second line.
    expect(column('#in-row')).toBe('2 / span 1');
    // Status column 2, inside the lane, whose grid starts at the gutter.
    expect(column('#in-lane')).toBe('4 / span 1');
    // Status column 0 on the board, after the gutter.
    expect(column('#on-board')).toBe('2 / span 1');
  });

  it('puts the status columns between two equal gutters', () => {
    const grid = render().querySelector('ui-board > div:first-child') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('1.75rem repeat(3, minmax(0, 1fr)) 1.75rem');
  });

  it('runs the title bar on down the lane’s left side, as one ┌ without overlap', () => {
    const lane = render().querySelector('ui-board-lane') as HTMLElement;
    const strip = lane.firstElementChild as HTMLElement;
    const bar = strip.nextElementSibling as HTMLElement;
    expect(strip.classList).toContain('inset-y-0');
    expect(strip.classList).toContain('w-6');
    expect(strip.textContent?.trim()).toBe('L-1');
    // The bar starts where the strip ends, in the same colour.
    expect(bar.classList).toContain('ml-6');
    expect(bar.classList).toContain('bg-charcoal-brown-800/40');
    expect(strip.classList).toContain('bg-charcoal-brown-800/40');
  });

  it('makes a card with a link a link', () => {
    const link = render().querySelector('#in-row a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/x/c-1');
    expect(render().querySelector('#on-board a')).toBeNull();
  });

  it('lays lanes out as plain groups off a board, nested too', () => {
    const fixture = TestBed.createComponent(OffBoard);
    fixture.detectChanges();
    const lanes = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('ui-board-lane'),
    ] as HTMLElement[];
    expect(lanes.map((lane) => lane.style.gridColumn)).toEqual(['', '']);
    expect(lanes.map((lane) => lane.classList.contains('flex'))).toEqual([true, true]);
  });

  describe('a collapsible lane', () => {
    function lane(collapsed: boolean) {
      const fixture = TestBed.createComponent(Collapsible);
      fixture.componentInstance.collapsed = collapsed;
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      // The animated wrapper around the rows (the element the button controls).
      const rows = () =>
        element.querySelector('ui-board-row')!.parentElement!.parentElement as HTMLElement;
      const summary = () => element.querySelector('[lane-summary]')!.parentElement as HTMLElement;
      const button = () => element.querySelector('ui-board-lane button') as HTMLButtonElement;
      return { fixture, rows, summary, button };
    }

    it('starts collapsed when told: the summary shows, the rows do not', () => {
      const { rows, summary, button } = lane(true);
      expect(rows().classList).toContain('grid-rows-[0fr]');
      expect(rows().getAttribute('hidden')).toBe('until-found');
      expect(summary().classList).toContain('opacity-100');
      expect(button().getAttribute('aria-expanded')).toBe('false');
      expect(button().getAttribute('aria-controls')).toBe(rows().id);
    });

    it('starts expanded otherwise', () => {
      const { rows, summary, button } = lane(false);
      expect(rows().classList).toContain('grid-rows-[1fr]');
      expect(rows().hasAttribute('hidden')).toBe(false);
      expect(summary().classList).toContain('opacity-0');
      expect(summary().hasAttribute('inert')).toBe(true);
      expect(button().getAttribute('aria-expanded')).toBe('true');
    });

    it('toggles on a click, both ways', () => {
      const { fixture, rows, summary, button } = lane(true);
      button().click();
      fixture.detectChanges();
      expect(rows().classList).toContain('grid-rows-[1fr]');
      expect(summary().classList).toContain('opacity-0');
      button().click();
      fixture.detectChanges();
      expect(rows().classList).toContain('grid-rows-[0fr]');
    });

    it('opens and is highlighted when find-in-page finds text in its rows', () => {
      const { fixture, rows, button } = lane(true);
      rows().dispatchEvent(new Event('beforematch'));
      fixture.detectChanges();
      expect(rows().hasAttribute('hidden')).toBe(false);
      expect(button().getAttribute('aria-expanded')).toBe('true');
      const highlighted = TestBed.inject(Highlighter).highlighted;
      expect(highlighted?.tagName).toBe('UI-BOARD-LANE');
      TestBed.inject(Highlighter).clear();
    });
  });
});
