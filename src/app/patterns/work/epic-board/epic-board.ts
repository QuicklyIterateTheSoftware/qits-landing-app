import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { epicBoardCounts, epicBoardRows } from '$core/work/epic-board';
import { EPIC_BOARD_COLUMNS } from '$core/work/work-statuses';
import type { WorkNode } from '$core/work/work-tree';
import { Board, type BoardColumnSpec } from '$ui/components/board/board';
import { BoardCard } from '$ui/components/board/board-card';
import { BoardRow } from '$ui/components/board/board-row';
import { Leave } from '$ui/components/leave/leave';
import { Tag } from '$ui/components/tag/tag';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';

/**
 * One epic with its own board, as the epic's page draws it on the board
 * (READY_FOR_DEV to VERIFYING):
 *
 * - with `header`, a bar on top that runs on down the left side as one ┌, as an epic's lane does on
 *   the In Progress board: the bar holds its status and a Workspace tag
 *   while it has an ACTIVE workspace (`app-workspace-link`) at its left, and its title (linking
 *   to it) at its right; the left
 *   strip holds its id, written up from the bottom. The strip is in the grid, so a long id makes
 *   the whole taller;
 * - below it a board (`ui-board`) of five columns (`EPIC_BOARD_COLUMNS`): the In Progress board's
 *   four, then Verified, each headed with how many cards it holds;
 * - each feature is a row (`ui-board-row`), as on the In Progress board but with its bar and
 *   strip solid (`solid`), not translucent: its title along the bottom, its id up the right gutter, a Workspace tag at the title line's end;
 * - each task is a card (`ui-board-card`) in its column (`epicBoardRows`: a DONE task muted in
 *   Verified, REPORTED and DROPPED ones left out), with its Workspace bubble.
 *
 * With no feature, the board says "No features". When `leaving` is set, the whole shrinks away
 * (`uiLeave`), then emits `left`. Every item links to its page,
 * `/projects/<slug>/work/detail/<qualified id>`, through a declared exit (`open-epic-board`, epic
 * qits-2000): `epic` (the bar's title and the strip's id), `feature` (a row's title) and `task` (a
 * card).
 */
@Component({
  selector: 'app-epic-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsExit, Board, BoardRow, BoardCard, Leave, Tag, WorkspaceLink],
  host: { class: 'block' },
  template: `
    @let n = node();
    @let s = slug();
    <article
      class="grid grid-cols-[1.75rem_minmax(0,1fr)] rounded-tl-xl ring-1 ring-line"
      data-highlight-target
      [attr.aria-label]="n.entry.title"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      @if (header()) {
        <!-- The left arm of the ┌, over the board's empty left gutter; above the board's
             headings, so it runs on unbroken past them. The headings are not pinned here: one
             epic's board is small enough not to need it. -->
        <div
          class="relative z-40 col-start-1 row-span-2 row-start-1 flex items-end justify-center rounded-tl-xl bg-surface-inverse/40 py-4 text-fg-on-inverse"
        >
          <a
            class="rotate-180 font-mono text-[0.6875rem] whitespace-nowrap text-inherit no-underline [writing-mode:vertical-rl] hover:underline"
            [qitsExit]="opening.epic"
            [exitParams]="{ slug: s, id: n.entry.qualifiedId ?? '' }"
            >{{ n.entry.qualifiedId }}</a
          >
        </div>
        <header
          class="col-start-2 row-start-1 flex flex-wrap items-center gap-2 bg-surface-inverse/40 px-3 py-1.5 text-xs text-fg-on-inverse [&>a]:text-inherit [&>a]:no-underline [&>a]:hover:underline"
        >
          <!-- First for a screen reader, drawn last: at the bar's right end. -->
          <a
            class="order-last ml-auto text-right text-sm font-semibold"
            [qitsExit]="opening.epic"
            [exitParams]="{ slug: s, id: n.entry.qualifiedId ?? '' }"
            >{{ n.entry.title }}</a
          >
          <ui-tag [label]="status()" [class.hidden]="!status()" />
          <app-workspace-link [workId]="n.entry.id" [qualifiedId]="n.entry.qualifiedId" />
        </header>
      }
      <!-- The board ends with its last row's title bar: no chin, as nothing here folds. pb-6: the
           board's columns reach 1.5rem past its own box (for what comes after it on a page);
           here the board is the end, so the box, and with it the strip, reaches them. -->
      <ui-board
        class="col-span-full row-start-2 pb-6 [&_ui-board-row:last-of-type]:mb-0"
        [columns]="columns()"
        [pinned]="false"
        gutter
      >
        @for (row of rows(); track row.node.entry.id) {
          <ui-board-row class="mb-4" solid [idLength]="row.node.entry.qualifiedId?.length ?? 0">
            @for (card of row.cards; track card.node.entry.id) {
              <ui-board-card
                class="self-start!"
                [class.opacity-60]="card.done"
                [column]="card.column"
                [code]="card.node.entry.qualifiedId ?? ''"
                [title]="card.node.entry.title ?? ''"
                [kind]="card.node.entry.archetype?.toLowerCase() ?? ''"
                [border]="borders[card.column]"
                [exit]="opening.task"
                [exitParams]="{ slug: s, id: card.node.entry.qualifiedId ?? '' }"
              >
                <app-workspace-link
                  card-corner
                  variant="corner"
                  [workId]="card.node.entry.id"
                  [qualifiedId]="card.node.entry.qualifiedId"
                />
              </ui-board-card>
            }
            <span row-id class="font-mono">{{ row.node.entry.qualifiedId }}</span>
            <a
              row-footer
              [qitsExit]="opening.feature"
              [exitParams]="{ slug: s, id: row.node.entry.qualifiedId ?? '' }"
              >{{ row.node.entry.title }}</a
            >
            <app-workspace-link
              row-footer-end
              [workId]="row.node.entry.id"
              [qualifiedId]="row.node.entry.qualifiedId"
            />
          </ui-board-row>
        }
        <p
          class="col-span-full m-0 mb-8 justify-self-center text-sm text-fg"
          [class.hidden]="rows().length"
        >
          No features
        </p>
      </ui-board>
    </article>
  `,
})
export class EpicBoard {
  /** The epic's node: its children are its features, theirs its tasks. */
  readonly node = input.required<WorkNode>();
  /** Shows the epic's own bar; off on the epic's page, which names it already. */
  readonly header = input(true, { transform: booleanAttribute });
  /** The epic is leaving the list: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly opening = outcomes('open-epic-board', {
    epic: exit('projects/:slug/work/detail/:id'),
    feature: exit('projects/:slug/work/detail/:id'),
    task: exit('projects/:slug/work/detail/:id'),
  });

  private readonly selected = inject(SelectedProject);
  /** The open project's slug, for the items' pages. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  protected readonly borders = EPIC_BOARD_COLUMNS.map((column) => column.cardBorder);

  protected readonly rows = computed(() => epicBoardRows(this.node()));

  protected readonly status = computed(() => this.node().entry.status?.toLowerCase() ?? '');

  /** The five columns, each with how many cards sit in it. */
  protected readonly columns = computed((): readonly BoardColumnSpec[] => {
    const counts = epicBoardCounts(this.rows());
    return EPIC_BOARD_COLUMNS.map((column, index) => ({
      label: column.label,
      body: column.body,
      header: column.header,
      count: counts[index],
    }));
  });
}
