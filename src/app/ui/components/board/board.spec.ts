import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
      <ui-board-lane [rows]="2">
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

  it('runs the lane’s gutter cell alongside its rows', () => {
    const gutter = render().querySelector('ui-board-lane > div:nth-child(2)') as HTMLElement;
    expect(gutter.style.gridRow).toBe('2 / span 2');
    expect(gutter.textContent?.trim()).toBe('L-1');
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
});
