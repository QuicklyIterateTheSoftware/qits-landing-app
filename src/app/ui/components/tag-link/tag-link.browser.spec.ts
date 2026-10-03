import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { Board, type BoardColumnSpec } from '$ui/components/board/board';
import { BoardCard } from '$ui/components/board/board-card';
import { BoardLane } from '$ui/components/board/board-lane';
import { BoardRow } from '$ui/components/board/board-row';
import { ListLane } from '$ui/components/list/list-lane';
import { ListRow } from '$ui/components/list/list-row';
import { TagLink } from './tag-link';

/**
 * Screenshots of the tag link in each place it is made for, with inline data: a lane's tags, a
 * row's footer (at its right end), and a card's bottom-right corner, on a board and in a list.
 */

const COLUMNS: readonly BoardColumnSpec[] = [
  { label: 'Refined', body: 'bg-ocean-deep-300', header: 'bg-ocean-deep-400 text-ocean-deep-950' },
  {
    label: 'Implemented',
    body: 'bg-sunflower-gold-300',
    header: 'bg-sunflower-gold-400 text-sunflower-gold-950',
  },
];

@Component({
  imports: [Board, BoardLane, BoardRow, BoardCard, TagLink],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane>
        <span lane-header class="font-semibold">An epic with a workspace</span>
        <ui-tag-link lane-tags label="Campaign: qits-10" link="/c" />
        <ui-tag-link lane-tags label="Workspace" link="/w" />
        <span lane-gutter class="font-mono">qits-12</span>
        <ui-board-row>
          <ui-board-card [column]="0" code="qits-14" title="A task with a workspace" kind="task">
            <ui-tag-link card-corner variant="corner" label="Workspace" link="/w" />
          </ui-board-card>
          <ui-board-card [column]="1" code="qits-15" title="A task without one" kind="task">
            <ui-tag-link card-corner variant="corner" label="Workspace" link="/w" [shown]="false" />
          </ui-board-card>
          <span row-id class="font-mono">qits-13</span>
          <span row-footer>A feature with a workspace</span>
          <ui-tag-link row-footer-end label="Workspace" link="/w" />
        </ui-board-row>
      </ui-board-lane>
      <ui-board-card
        [column]="1"
        code="qits-18"
        title="A ticket with a long title that wraps over two lines"
        kind="ticket"
      >
        <div class="mt-1 flex flex-wrap gap-1">
          <ui-tag-link label="Campaign: qits-10" link="/c" />
        </div>
        <ui-tag-link card-corner variant="corner" label="Workspace" link="/w" />
      </ui-board-card>
    </ui-board>
  `,
})
class OnBoard {
  readonly columns = COLUMNS;
}

@Component({
  imports: [ListLane, ListRow, BoardCard, TagLink],
  host: { class: 'block w-[30rem] p-4' },
  template: `
    <ui-list-lane>
      <span lane-header class="font-semibold">An epic in a list</span>
      <ui-tag-link lane-tags label="Workspace" link="/w" />
      <span lane-gutter class="font-mono">qits-12</span>
      <ui-list-row>
        <ui-board-card code="qits-14" title="A task with a workspace" kind="task">
          <ui-tag-link card-corner variant="corner" label="Workspace" link="/w" />
        </ui-board-card>
        <span row-id class="font-mono">qits-13</span>
        <span row-footer>A feature whose title is long enough to wrap before the tag</span>
        <ui-tag-link row-footer-end label="Workspace" link="/w" />
      </ui-list-row>
    </ui-list-lane>
  `,
})
class InList {}

describe('TagLink (screenshots)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  function shown(component: typeof OnBoard | typeof InList) {
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return page.elementLocator(fixture.nativeElement);
  }

  it('on a board: lane tags, a row footer and card corners', async () => {
    const element = shown(OnBoard);
    await expect.element(element.getByText('A task without one')).toBeVisible();
    await expect.element(element).toMatchScreenshot('board');
  });

  it('in a list: lane tags, a row footer and a card corner', async () => {
    const element = shown(InList);
    await expect.element(element.getByText('A task with a workspace')).toBeVisible();
    await expect.element(element).toMatchScreenshot('list');
  });
});
