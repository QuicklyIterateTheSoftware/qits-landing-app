import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { RouterLink } from '@angular/router';
import { ListItem } from '../list-item/list-item';
import { Tag } from '../tag/tag';
import { Board, type BoardColumnSpec } from './board';
import { BoardCard } from './board-card';
import { BoardLane } from './board-lane';
import { BoardRow } from './board-row';

/** Screenshots of the board pieces, with inline data: they are UI, not API answers. */

const COLUMNS: readonly BoardColumnSpec[] = [
  {
    label: 'Refined',
    count: 3,
    body: 'bg-ocean-deep-300',
    header: 'bg-ocean-deep-400 text-ocean-deep-950',
  },
  {
    label: 'Implemented',
    count: 2,
    body: 'bg-sunflower-gold-300',
    header: 'bg-sunflower-gold-400 text-sunflower-gold-950',
  },
  {
    label: 'Verified',
    count: 1,
    body: 'bg-mint-leaf-300',
    header: 'bg-mint-leaf-400 text-mint-leaf-950',
  },
];

@Component({
  imports: [Board, BoardLane, BoardRow, BoardCard, Tag],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane [rows]="2">
        <span lane-header class="font-semibold">An epic with two features</span>
        <ui-tag lane-tags label="Ordered campaign" />
        <ui-tag lane-tags label="Second campaign" />
        <span lane-gutter class="font-mono">qits-12</span>
        <ui-board-row>
          <ui-board-card [column]="1" code="qits-14" title="A shipped task" kind="task" />
          <ui-board-card [column]="0" code="qits-15" title="An open task" kind="task" />
          <span row-id class="font-mono">qits-13</span>
          <span row-footer>A feature ahead of its epic</span>
        </ui-board-row>
        <ui-board-row>
          <ui-board-card [column]="0" code="qits-17" title="Another open task" kind="task" />
          <span row-id class="font-mono">qits-16</span>
          <span row-footer>An open feature</span>
        </ui-board-row>
      </ui-board-lane>
      <ui-board-card [column]="1" code="qits-18" title="A standalone ticket" kind="ticket">
        <div class="mt-1"><ui-tag label="Ordered campaign" /></div>
      </ui-board-card>
    </ui-board>
  `,
})
class Variants {
  readonly columns = COLUMNS;
}

@Component({
  imports: [BoardLane, ListItem, Tag],
  host: { class: 'flex w-[36rem] flex-col gap-2 p-4' },
  template: `
    <ui-board-lane>
      <span lane-header>qits-1 · A group</span>
      <ui-tag lane-tags label="Ordered campaign" />
      <ui-list-item code="qits-2" title="An item" [chips]="['ticket']" />
      <ui-board-lane muted>
        <span lane-header>qits-3 · A muted parent that lives elsewhere</span>
        <ui-list-item code="qits-4" title="A nested item" [chips]="['task', 'done']" />
      </ui-board-lane>
    </ui-board-lane>
    <ui-list-item code="qits-5" title="An ungrouped item" [chips]="['ticket']">
      <ui-tag label="Second campaign" />
    </ui-list-item>
  `,
})
class Groups {}

@Component({
  imports: [Board, BoardLane, BoardRow, BoardCard, RouterLink],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane>
        <a lane-header id="epic" routerLink="/e">An epic</a>
        <ui-board-row>
          <ui-board-card id="task" [column]="0" code="t" title="A task" kind="task" link="/t" />
          <a row-footer id="feature" routerLink="/f">A feature</a>
        </ui-board-row>
      </ui-board-lane>
    </ui-board>
  `,
})
class Linked {
  readonly columns = COLUMNS;
}

describe('Board (screenshots)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('draws an epic lane with feature rows, tags and cards', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('board');
  });

  it('draws lanes as nested groups off a board', async () => {
    const fixture = TestBed.createComponent(Groups);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('groups');
  });

  it('shadows only the innermost hovered item', async () => {
    const fixture = TestBed.createComponent(Linked);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const shadow = (selector: string) =>
      getComputedStyle(element.querySelector(selector) as Element, '::after').boxShadow;
    const taskLink = element.querySelector('#task a') as HTMLElement;
    await userEvent.hover(taskLink);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(shadow('#task a')).not.toBe('none');
    expect(shadow('#feature')).toBe('none');
    expect(shadow('#epic')).toBe('none');
    await userEvent.hover(element.querySelector('#feature') as HTMLElement);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(shadow('#feature')).not.toBe('none');
    expect(shadow('#task a')).toBe('none');
    // Empty lane space (the gutter, below the rows) belongs to the epic.
    const lane = (element.querySelector('ui-board-lane') as HTMLElement).getBoundingClientRect();
    await userEvent.hover(element.querySelector('ui-board-lane') as HTMLElement, {
      position: { x: 6, y: lane.height - 4 },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(shadow('#epic')).not.toBe('none');
    expect(shadow('#feature')).toBe('none');
    await userEvent.unhover(element.querySelector('#feature') as HTMLElement);
  });
});
