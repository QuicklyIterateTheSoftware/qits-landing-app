import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { ListItem } from '../list-item/list-item';
import { Board, type BoardColumnSpec } from './board';
import { BoardCard } from './board-card';
import { BoardLane } from './board-lane';

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
  imports: [Board, BoardLane, BoardCard],
  host: { class: 'block w-[46rem] p-4' },
  template: `
    <ui-board [columns]="columns">
      <ui-board-lane [from]="0" [to]="2">
        <span lane-header>qits-1 · A campaign spanning all three</span>
        <ui-board-lane [from]="0" [to]="1">
          <span lane-header>qits-2 · An epic, a feature ahead of it</span>
          <ui-board-card [column]="0" code="qits-3" title="An open feature" kind="feature" />
          <ui-board-card [column]="1" code="qits-4" title="A shipped feature" kind="feature" />
        </ui-board-lane>
        <ui-board-card [column]="2" code="qits-5" title="A verified epic" kind="epic" />
      </ui-board-lane>
      <ui-board-lane [from]="1" [to]="1" muted>
        <span lane-header>qits-6 · A muted lane in one column</span>
        <ui-board-card [column]="1" code="qits-7" title="A task" kind="task" />
      </ui-board-lane>
      <ui-board-card [column]="0" code="qits-8" title="A standalone ticket" kind="ticket" />
    </ui-board>
  `,
})
class Variants {
  readonly columns = COLUMNS;
}

@Component({
  imports: [BoardLane, ListItem],
  host: { class: 'flex w-[36rem] flex-col gap-2 p-4' },
  template: `
    <ui-board-lane>
      <span lane-header>qits-1 · A group</span>
      <ui-list-item code="qits-2" title="An item" [chips]="['ticket']" />
      <ui-board-lane muted>
        <span lane-header>qits-3 · A muted parent that lives elsewhere</span>
        <ui-list-item code="qits-4" title="A nested item" [chips]="['task', 'done']" />
      </ui-board-lane>
    </ui-board-lane>
    <ui-list-item code="qits-5" title="An ungrouped item" [chips]="['ticket']" />
  `,
})
class Groups {}

describe('Board (screenshots)', () => {
  it('draws columns, nested lanes and cards', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('board');
  });

  it('draws lanes as nested groups off a board', async () => {
    const fixture = TestBed.createComponent(Groups);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('groups');
  });
});
