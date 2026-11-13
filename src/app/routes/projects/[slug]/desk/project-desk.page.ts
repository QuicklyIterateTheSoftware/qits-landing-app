import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import type { DeskTriggerEvent, DeskTriggerMessage } from '$core/desk/desk-triggers.consumes';
import { DESK_TRIGGER_MESSAGES } from '$core/desk/desk.operations';
import { utcMinute } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { commentAnchor } from '$core/work/comment-anchor';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { OpenIssues } from '$patterns/desk/open-issues/open-issues';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A qualified id of this shape is a release request's (`<repository>-rr-<n>`), never a work item's. */
const RELEASE_REQUEST_REF = /-rr-\d+$/;

/** A trigger message's state, as a chip's tone. */
function stateTone(state: string | undefined): ChipTone {
  switch (state) {
    case 'DELIVERED':
      return 'ok';
    case 'QUEUED':
    case 'OWED':
      return 'waiting';
    case 'FAILED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** `instant`, allowing the generated client's `| null`, as `utcMinute` formats it. */
function when(instant: string | null | undefined): string {
  return utcMinute(instant ?? undefined);
}

/**
 * The project's Desk page, at `/projects/<slug>/desk`: every message qits-projects' delivery desk
 * was sent by its desk triggers (epic qits-1604), newest `openedAt` first — qits-projects answers
 * them in that order already.
 *
 * Each row shows the window's state (OPEN, OWED, DELIVERED, QUEUED or FAILED), when it opened and,
 * once closed, when; while it is not yet accepted (`acceptedAt` null — OWED or FAILED) how many
 * deliveries were tried and the last one's refusal, when the service gave one. Below that, the
 * lines it collected: each event's source, the item it names — linking to the work item's or the
 * release request's own page where the qualified id's shape says which, plain text otherwise
 * (`app.routes.ts` has both routes), through the declared exits of `open-desk-line` — its label and its cause. A line that names a comment (a
 * `desk-mentioned` one carries `commentId`, qits-1660) links to that comment on the work item page
 * (`#comment-<commentId>`), so a person can read exactly what the desk was told about. The exact text sent to the desk is
 * in a collapsible `<details>`, hidden while the window is still OPEN (`message` is null until it
 * closes).
 *
 * The messages come from the page's own `qitsResource` over `DESK_TRIGGER_MESSAGES` (qits-2146),
 * read in the browser only, once per visit. A read that fails says so, with Retry. Marks
 * (qits-2141): the list is that read, each window a message by its id, each line an event of it.
 *
 * Above them, the project's open issues (`OpenIssues`, qits-1819).
 *
 * Staleness (qits-1270): none yet. No domain event marks a window opening, closing or being
 * delivered — a gap the "Live domain events" section of `AGENTS.md` lists others like — so Retry
 * is the only way to read this page again today.
 */
@Component({
  selector: 'app-project-desk-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    OpenIssues,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Desk">
        @if (selected.project()?.id; as projectId) {
          <app-open-issues [projectId]="projectId" [slug]="selected.slug() ?? ''" />
        }
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The messages this project’s delivery desk was sent by its desk triggers, newest first.
        </p>
        <ui-load-failure
          message="This project’s desk trigger messages could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul class="m-0 flex list-none flex-col gap-2 p-0" [qitsEntityList]="read">
            @for (message of messages(); track message.id) {
              <li
                class="rounded-md border border-line bg-surface px-3 py-2"
                [qitsEntity]="message"
                entityKey="id"
              >
                <div class="flex flex-wrap items-baseline gap-2">
                  <ui-chip
                    [label]="label(message)"
                    [tone]="tone(message)"
                    [fieldOf]="message"
                    [qitsField]="{ derived: ['state'] }"
                  />
                  <span
                    class="text-xs whitespace-nowrap text-fg-muted"
                    [fieldOf]="message"
                    [qitsField]="{ derived: ['openedAt'] }"
                    >{{ when(message.openedAt) }}</span
                  >
                  <span
                    class="text-xs whitespace-nowrap text-fg-muted"
                    [class.hidden]="!message.closedAt"
                    [fieldOf]="message"
                    [qitsField]="{ derived: ['closedAt'] }"
                    >– {{ when(message.closedAt) }}</span
                  >
                  <span
                    class="text-xs whitespace-nowrap text-fg-muted"
                    [class.hidden]="accepted(message)"
                    [fieldOf]="message"
                    [qitsField]="{ derived: ['attempts'] }"
                  >
                    {{ message.attempts ?? 0 }} attempt{{ message.attempts === 1 ? '' : 's' }}
                    <span
                      [class.hidden]="!message.lastDetail"
                      [fieldOf]="message"
                      [qitsField]="{ derived: ['lastStatus', 'lastDetail'] }"
                      >— {{ message.lastStatus }} {{ message.lastDetail }}</span
                    >
                  </span>
                </div>
                <ul class="mt-2 flex list-none flex-col gap-1 p-0 text-sm text-fg-soft">
                  @for (event of message.events ?? []; track eventKey(event)) {
                    <li
                      class="flex flex-wrap items-baseline gap-1.5"
                      [qitsEntity]="event"
                      entityKey="eventId"
                    >
                      <span
                        class="text-xs font-semibold text-fg-muted"
                        [fieldOf]="event"
                        qitsField="source"
                        >{{ event.source }}</span
                      >
                      @let kind = linked(event);
                      @if (kind === 'releaseRequest') {
                        <a
                          class="font-mono text-accent no-underline hover:underline"
                          [qitsExit]="opening.releaseRequest"
                          [exitParams]="{ slug: slug(), requestId: event.itemRef ?? '' }"
                          [fieldOf]="event"
                          qitsField="itemRef"
                          >{{ event.itemRef }}</a
                        >
                      } @else if (kind === 'workItem') {
                        <a
                          class="font-mono text-accent no-underline hover:underline"
                          [qitsExit]="opening.workItem"
                          [exitParams]="{ slug: slug(), id: event.itemRef ?? '' }"
                          [exitFragment]="fragment(event)"
                          [fieldOf]="event"
                          qitsField="itemRef"
                          >{{ event.itemRef }}</a
                        >
                      } @else {
                        <span class="font-mono" [fieldOf]="event" qitsField="itemRef">{{
                          event.itemRef
                        }}</span>
                      }
                      <span
                        [class.hidden]="!event.label"
                        [fieldOf]="event"
                        [qitsField]="{ derived: ['label'] }"
                        >({{ event.label }})</span
                      >
                      <span
                        class="text-xs text-fg-muted"
                        [class.hidden]="!event.cause"
                        [fieldOf]="event"
                        qitsField="cause"
                        >{{ event.cause }}</span
                      >
                    </li>
                  }
                </ul>
                <details class="mt-2" [class.hidden]="!message.message">
                  <summary class="cursor-pointer text-xs text-fg-muted">Message</summary>
                  <pre
                    class="mt-1 max-h-64 overflow-auto rounded bg-surface-inverse p-2 text-xs whitespace-pre-wrap text-fg-on-inverse"
                    [fieldOf]="message"
                    qitsField="message"
                    >{{ message.message }}</pre>
                </details>
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && messages().length === 0 ? 'block' : 'hidden'"
          >
            No desk trigger messages yet.
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectDeskPage {
  protected readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly when = when;

  /**
   * Where a line's item leads (`open-desk-line`, epic qits-2000), one exit per kind, chosen in the
   * template: a release request's page (`releaseRequest`) or a work item's (`workItem`), at the
   * comment the line came from when it names one.
   */
  protected readonly opening = outcomes('open-desk-line', {
    releaseRequest: exit('projects/:slug/release-requests/:requestId'),
    workItem: exit('projects/:slug/work/detail/:id'),
  });

  /** The open project's slug, for the lines' links. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The open project's desk trigger messages, in the browser only (the server has no session). */
  protected readonly read = qitsResource(DESK_TRIGGER_MESSAGES, () => {
    const projectId = this.selected.project()?.id;
    return this.browser && projectId ? { path: { projectId } } : undefined;
  });

  protected readonly messages = computed(() =>
    this.read.hasValue() ? (this.read.value()?.messages ?? []) : [],
  );

  protected readonly state = computed((): LoadState => loadState(this.read));

  protected label(message: DeskTriggerMessage): string {
    return (message.state ?? '').toLowerCase();
  }

  protected tone(message: DeskTriggerMessage): ChipTone {
    return stateTone(message.state);
  }

  /** Whether the desk's daemon has already taken the message (DELIVERED or QUEUED). */
  protected accepted(message: DeskTriggerMessage): boolean {
    return !!message.acceptedAt;
  }

  protected eventKey(event: DeskTriggerEvent): string {
    return event.eventId ?? `${event.source ?? ''}:${event.itemRef ?? ''}`;
  }

  /**
   * Which page an event's `itemRef` opens: the release request's for one shaped like a release
   * request's (`-rr-<n>`), the work item's for any other qualified id, none without a ref or a
   * project — which the template then shows as plain text.
   */
  protected linked(event: DeskTriggerEvent): 'releaseRequest' | 'workItem' | undefined {
    const ref = event.itemRef;
    if (!ref || !this.slug()) return undefined;
    return RELEASE_REQUEST_REF.test(ref) ? 'releaseRequest' : 'workItem';
  }

  /** The fragment of the link: the comment the line came from, when it names one (qits-1660). */
  protected fragment(event: DeskTriggerEvent): string | undefined {
    return event.commentId ? commentAnchor(event.commentId) : undefined;
  }

  /** Reads the list again after a failed read. */
  protected retry(): void {
    this.read.reload();
  }
}
