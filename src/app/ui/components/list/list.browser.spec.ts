import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { page } from 'vitest/browser';
import { BoardCard } from '$ui/components/board/board-card';
import { Tag } from '$ui/components/tag/tag';
import { ListLane } from './list-lane';
import { ListRow } from './list-row';

/** Screenshots of the list pieces, with inline data: they are UI, not API answers. */
@Component({
  imports: [ListLane, ListRow, BoardCard, Tag, RouterLink],
  host: { class: 'flex w-[40rem] flex-col gap-12 p-4 [&_ui-board-card]:self-stretch' },
  template: `
    <ui-list-lane collapsible>
      <a lane-header class="font-semibold" routerLink="/e">An epic in a list</a>
      <ui-tag lane-tags label="Ordered campaign" />
      <ui-tag lane-tags label="Second campaign" />
      <a lane-gutter class="font-mono" routerLink="/e">qits-1</a>
      <span lane-summary>2 tasks</span>
      <ui-list-row>
        <ui-board-card code="qits-3" title="A task in the list" kind="task" link="/t" />
        <ui-board-card
          code="qits-4"
          title="A second task, with a title long enough to wrap around the kind badge"
          kind="task"
          link="/t2"
        />
        <span row-id class="font-mono">qits-2</span>
        <a row-footer routerLink="/f">A feature</a>
      </ui-list-row>
    </ui-list-lane>
    <ui-list-lane collapsible collapsed>
      <a lane-header class="font-semibold" routerLink="/d">A done epic, collapsed</a>
      <ui-tag lane-tags label="done" />
      <a lane-gutter class="font-mono" routerLink="/d">qits-5</a>
      <span lane-summary>3 / 3 ✅</span>
    </ui-list-lane>
    <ui-board-card code="qits-6" title="A standalone ticket" kind="ticket" link="/k">
      <div class="mt-1"><ui-tag label="Second campaign" /></div>
    </ui-board-card>
  `,
})
class Variants {}

describe('List (screenshots)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('draws lanes, rows and cards like the board, without its columns', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('list');
  });
});
