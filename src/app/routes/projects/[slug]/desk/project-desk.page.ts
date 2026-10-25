import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DeskTriggerEvent, DeskTriggerMessage } from '$core/desk/desk-triggers.consumes';
import { DeskTriggersStore } from '$core/desk/desk-triggers.store';
import { utcMinute } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { WORK_DETAIL } from '$core/work/work-tabs';
import { RELEASE_REQUESTS } from '$layout/shell/shell.layout';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
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
 * (`app.routes.ts` has both routes) — its label and its cause. The exact text sent to the desk is
 * in a collapsible `<details>`, hidden while the window is still OPEN (`message` is null until it
 * closes).
 *
 * The messages come from `DeskTriggersStore`, read once per project. A read that fails says so,
 * with Retry.
 *
 * Staleness (qits-1270): none yet. No domain event marks a window opening, closing or being
 * delivered — a gap the "Live domain events" section of `AGENTS.md` lists others like — so Retry
 * is the only way to read this page again today.
 */
@Component({
  selector: 'app-project-desk-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Desk">
        <p class="mt-0 mb-4 text-sm text-gray-600">
          The messages this project’s delivery desk was sent by its desk triggers, newest first.
        </p>
        <ui-load-failure
          message="This project’s desk trigger messages could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (message of messages(); track message.id) {
              <li class="rounded-md border border-gray-200 bg-white px-3 py-2">
                <div class="flex flex-wrap items-baseline gap-2">
                  <ui-chip [label]="label(message)" [tone]="tone(message)" />
                  <span class="text-xs whitespace-nowrap text-gray-500">{{
                    when(message.openedAt)
                  }}</span>
                  <span
                    class="text-xs whitespace-nowrap text-gray-500"
                    [class.hidden]="!message.closedAt"
                    >– {{ when(message.closedAt) }}</span
                  >
                  <span
                    class="text-xs whitespace-nowrap text-gray-500"
                    [class.hidden]="accepted(message)"
                  >
                    {{ message.attempts ?? 0 }} attempt{{ message.attempts === 1 ? '' : 's' }}
                    <span [class.hidden]="!message.lastDetail"
                      >— {{ message.lastStatus }} {{ message.lastDetail }}</span
                    >
                  </span>
                </div>
                <ul class="mt-2 flex list-none flex-col gap-1 p-0 text-sm text-gray-700">
                  @for (event of message.events ?? []; track eventKey(event)) {
                    <li class="flex flex-wrap items-baseline gap-1.5">
                      <span class="text-xs font-semibold text-gray-500">{{ event.source }}</span>
                      @if (link(event); as href) {
                        <a
                          class="font-mono text-ocean-deep-700 no-underline hover:underline"
                          [routerLink]="href"
                          >{{ event.itemRef }}</a
                        >
                      } @else {
                        <span class="font-mono">{{ event.itemRef }}</span>
                      }
                      <span [class.hidden]="!event.label">({{ event.label }})</span>
                      <span class="text-xs text-gray-500" [class.hidden]="!event.cause">{{
                        event.cause
                      }}</span>
                    </li>
                  }
                </ul>
                <details class="mt-2" [class.hidden]="!message.message">
                  <summary class="cursor-pointer text-xs text-gray-500">Message</summary>
                  <pre
                    class="mt-1 max-h-64 overflow-auto rounded bg-charcoal-brown-950 p-2 text-xs whitespace-pre-wrap text-charcoal-brown-50"
                    >{{ message.message }}</pre>
                </details>
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-gray-500"
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
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(DeskTriggersStore);

  protected readonly when = when;

  private readonly answer = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.store.byProject()[id] : undefined;
  });

  protected readonly messages = computed(() => this.answer()?.messages ?? []);

  protected readonly state = computed((): LoadState => {
    const status = this.answer()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

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
   * The link an event's `itemRef` opens: the work item page for a work item's qualified id, the
   * release request page for one shaped like a release request's (`-rr-<n>`), undefined for
   * anything else — which the template then shows as plain text.
   */
  protected link(event: DeskTriggerEvent): string | undefined {
    const ref = event.itemRef;
    const slug = this.selected.slug();
    if (!ref || !slug) return undefined;
    return RELEASE_REQUEST_REF.test(ref)
      ? `/projects/${slug}/${RELEASE_REQUESTS}/${ref}`
      : `/projects/${slug}/work/${WORK_DETAIL}/${ref}`;
  }

  /** Reads the list again after a failed read. */
  protected retry(): void {
    const id = this.selected.project()?.id;
    if (id) void this.store.load(id);
  }

  constructor() {
    // In the browser only (the server render has no session cookie). The store fetches once per
    // project.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const id = this.selected.project()?.id;
      if (browser && id) untracked(() => void this.store.load(id));
    });
  }
}
