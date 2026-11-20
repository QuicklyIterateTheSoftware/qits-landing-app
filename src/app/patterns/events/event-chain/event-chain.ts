import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QitsEntity, QitsExit, QitsField, type ExitOutcome } from '@qits/angular';
import { QitsBadge } from '@qits/ui-components';
import {
  chainCaption,
  DOWN_DEPTH_CAP,
  DOWN_NODE_CAP,
  UP_HOP_CAP,
  type Chain,
  type ChainEvent,
  type ChainRow,
} from '$core/events/event-chain';
import { EVENT_CHILDREN, PROJECT_EVENT } from '$core/events/events.operations';
import { belongsToProject, eventGist, eventTone } from '$core/events/project-event';
import { formatInstant } from '$core/release-requests/release-request-model';

/** The reads a row's event came from: the start by `getEvent`, every other by `listEvents`. */
const START_SOURCE = { operation: PROJECT_EVENT } as const;
const EFFECT_SOURCE = { operation: EVENT_CHILDREN } as const;

/** The data marks of what a row derives from its event (class constants, which the rule trusts). */
const MARKS = {
  occurredAt: { derived: ['occurredAt'] },
  repository: { derived: ['payload'] },
  summary: { derived: ['payload', 'description'] },
} as const;

/**
 * An event's chain as a table (qits-2338, the event page's Chain panel): the walk's statement
 * where its start is not an ordinary root (the cause is not in the log, the chain loops, or the
 * walk stopped after {@link UP_HOP_CAP} hops), then one row per event, pre-order and indented by
 * its depth below the start: its time (UTC), its name as a badge, its repository and its gist
 * (`eventGist`). The page's own event is marked "this event" (`aria-current`); every other event
 * of the project (`belongsToProject`) links its own page through `exit`, with `slug`; another
 * project's is drawn but not linked. A child already drawn and the depth cap draw a statement row
 * each, and the node cap a note below the table. Captioned `N events · M requests`
 * (`chainCaption`).
 *
 * Marks (qits-2141): each row's event is an entity by its id, from `getEvent` at the start and
 * `listEvents` below it; its time, repository and gist derived from its fields.
 */
@Component({
  selector: 'app-event-chain',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsBadge, QitsEntity, QitsExit, QitsField],
  host: { class: 'block' },
  template: `
    @switch (chain().start.kind) {
      @case ('dangling') {
        <p class="mt-0 mb-2 text-sm text-fg-soft" data-start>
          The cause is not in the log: the first event below names a cause this log does not hold
          (deleted, or never published), so the chain starts there.
        </p>
      }
      @case ('cycle') {
        <p class="mt-0 mb-2 text-sm text-fg-soft" data-start>
          The chain loops: the first event below names a cause already on this walk, so the walk
          stopped there.
        </p>
      }
      @case ('capped') {
        <p class="mt-0 mb-2 text-sm text-fg-soft" data-start>
          The walk stopped after {{ upHopCap }} hops up, short of the chain's start: there is more
          above the first event below.
        </p>
      }
    }
    <div class="overflow-x-auto rounded-md border border-line">
      <table class="w-full min-w-[48rem] border-collapse text-left text-sm" aria-label="Chain">
        <caption class="caption-bottom px-3 py-1.5 text-left text-xs text-fg-muted">
          {{
            caption()
          }}
        </caption>
        <thead class="bg-surface-muted text-xs text-fg-muted">
          <tr>
            <th class="px-3 py-1.5 font-semibold" scope="col">Time (UTC)</th>
            <th class="px-3 py-1.5 font-semibold" scope="col">Event</th>
            <th class="px-3 py-1.5 font-semibold" scope="col">Repository</th>
            <th class="px-3 py-1.5 font-semibold" scope="col">Summary</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            @if (row.kind === 'event') {
              @let event = row.event;
              <tr
                class="border-t border-line-subtle"
                [class.bg-accent-soft]="row.current"
                [attr.aria-current]="row.current ? 'true' : null"
                [qitsEntity]="event"
                entityKey="id"
                [entitySource]="row.depth === 0 ? startSource : effectSource"
              >
                <th
                  class="px-3 py-1.5 font-normal whitespace-nowrap tabular-nums"
                  scope="row"
                  [fieldOf]="event"
                  [qitsField]="marks.occurredAt"
                >
                  @if (row.current) {
                    <span class="text-fg">{{ time(event.occurredAt) }}</span>
                  } @else if (linked(event)) {
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="exit()"
                      [exitParams]="{ slug: slug(), id: event.id ?? '' }"
                      >{{ time(event.occurredAt) }}</a
                    >
                  } @else {
                    <span class="text-fg">{{ time(event.occurredAt) }}</span>
                  }
                </th>
                <td class="py-1.5 pr-3" [style.padding-left.rem]="0.75 + row.depth * 1.25">
                  <span class="inline-flex flex-wrap items-center gap-2">
                    <qits-badge
                      [label]="event.name ?? ''"
                      [tone]="tone(event.name)"
                      [fieldOf]="event"
                      qitsField="name"
                    />
                    @if (row.current) {
                      <span class="text-xs font-semibold text-accent">this event</span>
                    }
                  </span>
                </td>
                <td
                  class="px-3 py-1.5 font-mono text-xs break-all"
                  [fieldOf]="event"
                  [qitsField]="marks.repository"
                >
                  {{ repositoryOf(event) }}
                </td>
                <td
                  class="px-3 py-1.5 wrap-anywhere text-fg-soft"
                  [fieldOf]="event"
                  [qitsField]="marks.summary"
                >
                  {{ summaryOf(event) }}
                </td>
              </tr>
            } @else {
              <tr class="border-t border-line-subtle" data-statement>
                <td
                  class="py-1.5 pr-3 text-sm text-fg-soft"
                  colspan="4"
                  [style.padding-left.rem]="0.75 + row.depth * 1.25"
                >
                  @if (row.kind === 'loop') {
                    Loops back to an event already drawn above: the walk stopped rather than going
                    round again.
                  } @else {
                    The walk stopped at depth {{ downDepthCap }}: what the event above caused was
                    not asked for.
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
    @if (chain().capped) {
      <p class="mt-2 mb-0 text-sm text-fg-soft" data-node-cap>
        The walk stopped at {{ downNodeCap }} events, its cap on one graph: this is part of the
        chain, not all of it.
      </p>
    }
  `,
})
export class EventChain {
  /** The walked graph's rows (`Chain.rows`), typed by the reads they came from. */
  readonly rows = input.required<readonly ChainRow<ChainEvent>[]>();
  /** The walked graph: where it starts, whether the node cap ended it, what it cost. */
  readonly chain = input.required<Chain>();
  /** The open project's id: only its events link their page. */
  readonly projectId = input.required<string | undefined>();
  /** The open project's slug, the exit's `:slug`. */
  readonly slug = input.required<string>();
  /** Where an event of the project leads: its page (`projects/:slug/events/:id`). */
  readonly exit = input.required<ExitOutcome>();

  protected readonly caption = computed(() => chainCaption(this.chain()));
  protected readonly startSource = START_SOURCE;
  protected readonly effectSource = EFFECT_SOURCE;
  protected readonly marks = MARKS;
  protected readonly upHopCap = UP_HOP_CAP;
  protected readonly downDepthCap = DOWN_DEPTH_CAP;
  protected readonly downNodeCap = DOWN_NODE_CAP;
  protected readonly time = formatInstant;
  protected readonly tone = eventTone;

  protected linked(event: ChainEvent): boolean {
    return !!event.id && belongsToProject(event, this.projectId());
  }

  protected repositoryOf(event: ChainEvent): string {
    return eventGist(event).repository ?? '—';
  }

  protected summaryOf(event: ChainEvent): string {
    return eventGist(event).summary;
  }
}
