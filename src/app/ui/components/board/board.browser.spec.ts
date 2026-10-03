import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { RouterLink } from '@angular/router';
import { FinishButton } from '$ui/components/finish-button/finish-button';
import { Tag } from '$ui/components/tag/tag';
import { Board, type BoardColumnSpec } from './board';
import { BoardCard } from './board-card';
import { BoardCount } from './board-count';
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
      <ui-board-lane>
        <span lane-header class="font-semibold">An epic with two features</span>
        <ui-tag lane-tags label="Ordered campaign" />
        <ui-tag lane-tags label="Second campaign" />
        <ui-tag lane-tags label="A third campaign with a long name" />
        <ui-tag lane-tags label="Fourth campaign" />
        <ui-tag lane-tags label="The fifth and last campaign, which wraps" />
        <span lane-gutter class="font-mono">qits-12</span>
        <ui-board-row>
          <ui-board-card [column]="1" code="qits-14" title="A shipped task" kind="task" />
          <ui-board-card [column]="0" code="qits-15" title="An open task" kind="task" />
          <span row-id class="font-mono">qits-13</span>
          <span row-footer>A feature ahead of its epic</span>
        </ui-board-row>
        <ui-board-row>
          <ui-board-card
            [column]="0"
            code="qits-17"
            title="A long task title that wraps over several lines, flowing around the kind badge"
            kind="maintenance"
          />
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
  imports: [Board, BoardLane, BoardRow, BoardCard, BoardCount, Tag],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane collapsible collapsed>
        <span lane-header class="font-semibold">An epic, collapsed to its counts</span>
        <ui-tag lane-tags label="Ordered campaign" />
        <span lane-gutter class="font-mono">qits-20</span>
        <ui-board-count lane-summary [column]="0" [count]="16" label="refined" />
        <ui-board-count lane-summary column="gutter" [count]="1" label="verified" />
        <ui-board-row>
          <ui-board-card [column]="2" code="qits-22" title="Hidden while collapsed" kind="task" />
          <span row-footer>A feature</span>
        </ui-board-row>
      </ui-board-lane>
      <ui-board-lane collapsible>
        <span lane-header class="font-semibold">An epic in progress, expanded</span>
        <span lane-gutter class="font-mono">qits-30</span>
        <span lane-summary>0 / 1 ✅</span>
        <ui-board-row>
          <ui-board-card [column]="0" code="qits-32" title="An open task" kind="task" />
          <span row-id class="font-mono">qits-31</span>
          <span row-footer>A feature</span>
        </ui-board-row>
      </ui-board-lane>
    </ui-board>
  `,
})
class Collapsing {
  readonly columns = COLUMNS;
}

@Component({
  imports: [Board, BoardLane, BoardCard, FinishButton],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane collapsible collapsed>
        <span lane-header class="font-semibold">A verified epic</span>
        <span lane-gutter class="font-mono">qits-40</span>
        <span lane-summary>2 / 2 ✅</span>
        <ui-finish-button lane-action label="Mark qits-40 done" />
      </ui-board-lane>
      <ui-board-card [column]="2" code="qits-41" title="A verified ticket" kind="ticket">
        <ui-finish-button card-action label="Mark qits-41 done" />
      </ui-board-card>
      <ui-board-card [column]="2" code="qits-42" title="Finishing…" kind="ticket">
        <ui-finish-button card-action label="Mark qits-42 done" state="running" />
      </ui-board-card>
      <ui-board-card [column]="2" code="qits-43" title="Failed to finish" kind="ticket">
        <ui-finish-button card-action label="Mark qits-43 done" state="error" />
      </ui-board-card>
    </ui-board>
  `,
})
class Finishing {
  readonly columns = COLUMNS;
}

@Component({
  imports: [Board, BoardLane, BoardRow, BoardCard, RouterLink],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-card id="ticket" [column]="1" code="k" title="A ticket" kind="ticket" link="/k" />
      <ui-board-lane>
        <a lane-header id="epic" routerLink="/e">An epic</a>
        <ui-board-row>
          <ui-board-card id="task" [column]="0" code="t" title="A task" kind="task" link="/t" />
          <span row-id id="feature-id">f-1</span>
          <a row-footer id="feature" routerLink="/f">A feature</a>
        </ui-board-row>
      </ui-board-lane>
    </ui-board>
  `,
})
class Linked {
  readonly columns = COLUMNS;
}

/**
 * A feature row by what its gutter holds, with an id of 20 characters: `verified`, its tasks all
 * past the board (a tile, no cards); `mixed` (a tile and a card); `empty` (neither). Or `folded`: a
 * collapsed lane with an id as long.
 */
@Component({
  imports: [Board, BoardLane, BoardRow, BoardCard, BoardCount],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      @if (kind === 'folded') {
        <ui-board-lane id="folded" collapsible collapsed>
          <span lane-header class="font-semibold">A collapsed epic with a long id</span>
          <span lane-gutter class="font-mono">contract-00000001-17</span>
          <ui-board-count lane-summary [column]="0" [count]="2" label="refined" />
          <ui-board-count lane-summary column="gutter" [count]="1" label="verified" />
        </ui-board-lane>
      } @else {
        <ui-board-lane>
          <span lane-header class="font-semibold">An epic</span>
          <span lane-gutter class="font-mono">contract-00000001-10</span>
          <ui-board-row id="row">
            @if (kind === 'mixed') {
              <ui-board-card [column]="1" code="qits-14" title="A shipped task" kind="task" />
            }
            @if (kind !== 'empty') {
              <ui-board-count row-gutter column="gutter" [count]="count" label="verified" />
            }
            <span row-id class="font-mono">contract-00000001-11</span>
            <span row-footer>A feature</span>
          </ui-board-row>
        </ui-board-lane>
      }
    </ui-board>
  `,
})
class GutterCase {
  readonly columns = COLUMNS;
  kind: 'verified' | 'mixed' | 'empty' | 'folded' = 'verified';
  count = 3;
}

/** A word longer than a column, with no space to break at: in a card title, a lane title and a feature title. */
const LONG_WORD = 'qits-landing-app/src/app/ui/components/board/board-card.ts:wrap-anywhere';

@Component({
  imports: [Board, BoardLane, BoardRow, BoardCard],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      <ui-board-lane>
        <span lane-header class="font-semibold">{{ word }}</span>
        <ui-board-row>
          <ui-board-card id="long" [column]="0" code="qits-51" [title]="word" kind="task" />
          <span row-footer>{{ word }}</span>
        </ui-board-row>
      </ui-board-lane>
    </ui-board>
  `,
})
class LongWords {
  readonly columns = COLUMNS;
  readonly word = LONG_WORD;
}

/**
 * A board taller than its 20rem scroller, as a long board in the document, with a 2.5rem bar and
 * 2rem of pinned actions above it (`--app-header-h`, `--page-actions-h`) and space after it.
 */
@Component({
  imports: [Board, BoardCard],
  host: {
    class: 'block h-80 w-[48rem] overflow-y-auto px-4',
    style: '--app-header-h: 2.5rem; --page-actions-h: 2rem',
  },
  template: `
    <div class="sticky top-0 z-50 h-10 bg-charcoal-brown-800"></div>
    <div class="sticky top-10 z-40 h-8 bg-charcoal-brown-200"></div>
    <ui-board [columns]="columns" gutter>
      @for (card of cards; track card) {
        <ui-board-card [column]="card % 3" [code]="'qits-' + card" title="A card" kind="task" />
      }
    </ui-board>
    <div class="h-[40rem]"></div>
  `,
})
class LongBoard {
  readonly columns = COLUMNS;
  readonly cards = Array.from({ length: 12 }, (_, i) => i + 1);
}

describe('Board (screenshots)', () => {
  it('pins the headings below the bar and the actions while the board is in view', async () => {
    const fixture = TestBed.createComponent(LongBoard);
    fixture.detectChanges();
    const scroller = fixture.nativeElement as HTMLElement;
    const headings = scroller.querySelector<HTMLElement>('[data-board-headings]')!;
    const board = scroller.querySelector<HTMLElement>('ui-board')!;
    scroller.scrollTop = 300;
    // 2.5rem + 2rem = 72px below the scroller's top edge, though the board's top has scrolled away.
    expect(Math.round(headings.getBoundingClientRect().top)).toBe(
      Math.round(scroller.getBoundingClientRect().top) + 72,
    );
    expect(board.getBoundingClientRect().top).toBeLessThan(scroller.getBoundingClientRect().top);
    await expect.element(page.elementLocator(scroller)).toMatchScreenshot('pinned-headings');
    // Past the board's end the headings leave with it.
    scroller.scrollTop +=
      board.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top - 20;
    expect(headings.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      board.getBoundingClientRect().bottom + 1,
    );
  });

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('draws an epic lane with feature rows, tags and cards', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('board');
  });

  it('draws a collapsed and an expanded lane', async () => {
    const fixture = TestBed.createComponent(Collapsing);
    fixture.detectChanges();
    await expect
      .element(page.elementLocator(fixture.nativeElement))
      .toMatchScreenshot('lanes-collapsing');
  });

  it('draws the finish button on verified items, idle, running and failed', async () => {
    const fixture = TestBed.createComponent(Finishing);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('finishing');
  });

  /** Renders one `GutterCase`. */
  function gutterCase(kind: GutterCase['kind'], count = 3): HTMLElement {
    const fixture = TestBed.createComponent(GutterCase);
    fixture.componentInstance.kind = kind;
    fixture.componentInstance.count = count;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const box = (e: Element) => e.getBoundingClientRect();

  it.each([
    ['verified', 3, '3 verified'],
    ['mixed', 1, '1 verified'],
    ['empty', 0, undefined],
  ] as const)('draws a feature row, %s, its long id whole', async (kind, count, srText) => {
    const element = gutterCase(kind, count);
    const row = element.querySelector('#row') as HTMLElement;
    const label = row.querySelector('[row-id]')!;
    // The id's rotated wrapper, then the strip.
    const strip = label.parentElement!.parentElement!;
    expect(box(label).top).toBeGreaterThanOrEqual(box(strip).top);
    expect(box(label).bottom).toBeLessThanOrEqual(box(strip).bottom);
    // The bar stays at the row's bottom.
    const bar = row.querySelector('[row-footer]')!.parentElement!;
    expect(Math.round(box(bar).bottom)).toBe(Math.round(box(row).bottom));
    const tile = row.querySelector('ui-board-count');
    expect(tile?.querySelector('.sr-only')?.textContent?.trim()).toBe(srText);
    if (tile) {
      // At the top of the strip, inside it, above the id.
      expect(box(tile).bottom).toBeLessThanOrEqual(box(label).top);
      expect(box(tile).left).toBeGreaterThanOrEqual(box(strip).left);
      expect(box(tile).right).toBeLessThanOrEqual(box(strip).right);
    }
    await expect.element(page.elementLocator(element)).toMatchScreenshot(`row-${kind}`);
  });

  it('draws a collapsed lane with its long id whole', async () => {
    const element = gutterCase('folded');
    const lane = element.querySelector('#folded') as HTMLElement;
    expect(box(lane.querySelector('[lane-gutter]')!).top).toBeGreaterThanOrEqual(box(lane).top);
    await expect.element(page.elementLocator(element)).toMatchScreenshot('lane-long-id');
  });

  it('breaks a word too long for its card, lane or feature title instead of overflowing', async () => {
    const fixture = TestBed.createComponent(LongWords);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const card = element.querySelector('#long') as HTMLElement;
    const header = element.querySelector('ui-board-lane') as HTMLElement;
    // The card stays in its column: no wider than the Refined header.
    const column = element.querySelector('ui-board > div:first-child > div:nth-child(2)')!;
    expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(
      column.getBoundingClientRect().right,
    );
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
    await expect.element(page.elementLocator(element)).toMatchScreenshot('long-words');
  });

  it('shadows a standalone ticket card', async () => {
    const fixture = TestBed.createComponent(Linked);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const ticket = element.querySelector('#ticket') as HTMLElement;
    expect(getComputedStyle(ticket).boxShadow).toBe('none');
    await userEvent.hover(ticket.querySelector('a') as HTMLElement);
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Visible: on the card's own box, which nothing clips.
    expect(getComputedStyle(ticket).boxShadow).toMatch(/rgba\(0, 0, 0, 0\.1\)/);
    await userEvent.unhover(ticket.querySelector('a') as HTMLElement);
  });

  it('shadows only the innermost hovered item', async () => {
    const fixture = TestBed.createComponent(Linked);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // A card casts its shadow from its own box; a lane or row from its link's stretched ::after.
    const shadow = (selector: string) => {
      const target = element.querySelector(selector) as Element;
      return target.tagName === 'UI-BOARD-CARD'
        ? getComputedStyle(target).boxShadow
        : getComputedStyle(target, '::after').boxShadow;
    };
    const taskLink = element.querySelector('#task a') as HTMLElement;
    await userEvent.hover(taskLink);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(shadow('#task')).not.toBe('none');
    expect(shadow('#feature')).toBe('none');
    expect(shadow('#epic')).toBe('none');
    await userEvent.hover(element.querySelector('#feature') as HTMLElement);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(shadow('#feature')).not.toBe('none');
    expect(shadow('#task')).toBe('none');
    // The feature's id strip in the right gutter belongs to the feature, not the epic.
    // Over the strip, by position: the feature's stretched link lies on top of it, as meant.
    const idBox = (element.querySelector('#feature-id') as HTMLElement).getBoundingClientRect();
    const rowEl = element.querySelector('ui-board-row') as HTMLElement;
    const rowBox = rowEl.getBoundingClientRect();
    await userEvent.hover(rowEl, {
      position: {
        x: idBox.x + idBox.width / 2 - rowBox.x,
        y: idBox.y + idBox.height / 2 - rowBox.y,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(shadow('#feature')).not.toBe('none');
    expect(shadow('#epic')).toBe('none');
    const strip = (element.querySelector('#feature-id') as HTMLElement).getBoundingClientRect();
    const hit = document.elementFromPoint(strip.x + strip.width / 2, strip.y + strip.height / 2);
    expect(hit?.closest('a')?.id).toBe('feature');
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
