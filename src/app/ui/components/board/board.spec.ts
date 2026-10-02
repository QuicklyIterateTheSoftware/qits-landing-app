import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Board, type BoardColumnSpec } from './board';
import { BoardCard } from './board-card';
import { BoardLane } from './board-lane';

const COLUMNS: readonly BoardColumnSpec[] = [
  { label: 'One', count: 1, body: 'bg-ocean-deep-300', header: 'bg-ocean-deep-400' },
  { label: 'Two', body: 'bg-sunflower-gold-300', header: 'bg-sunflower-gold-400' },
  { label: 'Three', body: 'bg-mint-leaf-300', header: 'bg-mint-leaf-400' },
];

@Component({
  imports: [Board, BoardLane, BoardCard],
  template: `
    <ui-board [columns]="columns">
      <ui-board-lane [from]="1" [to]="2">
        <span lane-header>Lane</span>
        <ui-board-card [column]="2" code="c-2" title="In three" kind="task" />
        <ui-board-lane [from]="1" [to]="1" muted>
          <span lane-header>Inner</span>
          <ui-board-card [column]="1" code="c-1" title="In two" kind="task" />
        </ui-board-lane>
      </ui-board-lane>
      <ui-board-card [column]="0" code="c-0" title="In one" kind="ticket" />
    </ui-board>
  `,
})
class Host {
  readonly columns = COLUMNS;
}

@Component({
  imports: [BoardLane, BoardCard],
  template: `
    <ui-board-lane [from]="1" [to]="2">
      <span lane-header>Off</span>
      <ui-board-lane muted><span lane-header>Nested</span></ui-board-lane>
    </ui-board-lane>
  `,
})
class OffBoard {}

describe('Board', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws one heading and one colour stripe per column', () => {
    const element = render();
    const headings = [...element.querySelectorAll('ui-board > div:first-child > div')];
    expect(headings.map((h) => h.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'One 1',
      'Two',
      'Three',
    ]);
    const stripes = [...element.querySelectorAll('ui-board [aria-hidden="true"] > div')];
    expect(stripes.map((s) => s.className)).toEqual([
      'bg-ocean-deep-300',
      'bg-sunflower-gold-300',
      'bg-mint-leaf-300',
    ]);
  });

  it('places cards and lanes in their columns, relative to the lane they are in', () => {
    const element = render();
    const column = (selector: string) =>
      (element.querySelector(selector) as HTMLElement).style.gridColumn;
    // On the board: absolute column + 1.
    expect(column('ui-board > div > div > ui-board-card')).toBe('1 / span 1');
    expect(column('ui-board > div > div > ui-board-lane')).toBe('2 / span 2');
    // Inside the lane from column 1: column 2 is the lane's second line.
    expect(column('ui-board-lane > ui-board-card')).toBe('2 / span 1');
    expect(column('ui-board-lane ui-board-lane')).toBe('1 / span 1');
    expect(column('ui-board-lane ui-board-lane ui-board-card')).toBe('1 / span 1');
  });

  it('lays a lane out as a plain group off a board', () => {
    const fixture = TestBed.createComponent(OffBoard);
    fixture.detectChanges();
    const lane = (fixture.nativeElement as HTMLElement).querySelector(
      'ui-board-lane',
    ) as HTMLElement;
    expect(lane.style.gridColumn).toBe('');
    expect(lane.classList.contains('grid')).toBe(false);
  });
});
