import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  resource,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, QitsEntity, QitsExit, QitsField, qitsResource } from '@qits/angular';
import { QitsBadge } from '@qits/ui-components';
import { PROJECT_CHAIN_READER, walkChain, type Chain } from '$core/events/event-chain';
import type { ProjectEventDetail } from '$core/events/events.consumes';
import { PROJECT_EVENT } from '$core/events/events.operations';
import { belongsToProject, eventGist, eventTone, renderPayload } from '$core/events/project-event';
import { eventSubjects, type EventSubject } from '$core/events/project-events';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant } from '$core/release-requests/release-request-model';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { EventChain } from '$patterns/events/event-chain/event-chain';
import { JsonBlock } from '$ui/components/json-block/json-block';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The data marks of what the page derives from the event (a class constant, as the rule reads). */
const MARKS = {
  gist: { derived: ['payload', 'description'] },
  subjects: { derived: ['payload'] },
  occurredAt: { derived: ['occurredAt'] },
  createdAt: { derived: ['createdAt'] },
  updatedAt: { derived: ['updatedAt'] },
  environment: { derived: ['environment'] },
  description: { derived: ['description'] },
  parentId: { derived: ['parentId'] },
  payload: { derived: ['payload'] },
} as const;

/**
 * One of a project's domain events, at `/projects/<slug>/events/<id>` (qits-2338; replaces
 * qits-events-frontend's event page), the path mirroring `GET /events/api/events/{id}`. A detail
 * page of the Events section: no sidebar entry of its own, reached from a row of the Events page,
 * and from this page's cause and chain.
 *
 * - Header: "← Events" back to the list (`leave-project-event`); the event's name with its badge
 *   (`info` for a release: `SCMRelease`, `SoftwareRelease`); its repository · gist (`eventGist`);
 *   and what it concerns (`eventSubjects`, as the list's rows), a release request linking its page
 *   (`open-project-event-subject` `releaseRequest`). A work item is named, not linked: no recorded
 *   event this page reads names one, so no screenshot could follow that exit.
 * - Facts: Occurred (`formatInstant`, and the exact instant as it was stamped), Recorded
 *   (`createdAt`), Updated (`updatedAt`), Id, Publisher, Environment (else "Recorded before the
 *   platform stamped tiers."), Description (else "None") and Cause: the causing event's page
 *   (`open-related-project-event` `cause`), else "Nothing in the log caused this event."
 * - Payload: the whole payload (`renderPayload`), pretty with its keys sorted, or the string as it
 *   arrived when it is not JSON (`ui-json-block`, with Copy); none is "This event carries no
 *   payload."
 * - Chain: what caused it and what it caused (`walkChain`, `core/events/event-chain.ts`: up by
 *   `parentId`, then down from the start by `?parentId=`, bounded at 32 hops up, 8 levels down and
 *   200 events), as `app-event-chain`: every other event of the project links its page
 *   (`open-related-project-event` `chain`). The walk is a panel of its own: loading, and a failure
 *   with Retry, while the header and payload stay on screen.
 *
 * States: loading; a failed read with Retry; a 404, or an event whose payload names another
 * project (`belongsToProject`: `payloadIds().projectIds`), is "No event <id> in this project." with
 * a link back to the list.
 *
 * Reads, in the browser only (the server render has no session): the event through its own
 * `qitsResource` over `PROJECT_EVENT` (`getEvent`), and the chain through `PROJECT_EVENT`'s and
 * `EVENT_CHILDREN`'s `fetch` (`PROJECT_CHAIN_READER`), once the event is read and the project's.
 * Following a link to another event reuses the page: the id is read from the route as a signal.
 * Marks (qits-2141): the event is an entity by its id, each value its field or the fields it is
 * derived from; each chain row's event too (`app-event-chain`).
 *
 * Staleness (qits-1270): none. An event never changes once recorded; what it later causes shows
 * on the next visit.
 */
@Component({
  selector: 'app-project-event-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EventChain,
    JsonBlock,
    LoadFailure,
    PageLayoutComponent,
    QitsBadge,
    QitsEntity,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Event">
        <p class="mt-0 mb-4 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ slug: slug() }"
            [exitCurrent]="null"
            data-back
            >← Events</a
          >
        </p>
        <ui-load-failure
          message="This event could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="read.reload()"
        />
        @if (missing()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-missing>
            No event {{ eventId() }} in this project.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.back"
              [exitParams]="{ slug: slug() }"
              [exitCurrent]="null"
              >Back to Events</a
            >
          </p>
        }
        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="state() === 'error' || missing()"
        >
          @if (shown(); as event) {
            <article [qitsEntity]="event" entityKey="id" [entitySource]="read" data-event>
              <header class="mb-4 flex flex-col gap-1">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2
                    class="m-0 text-lg font-semibold break-all text-fg"
                    [fieldOf]="event"
                    qitsField="name"
                  >
                    {{ event.name }}
                  </h2>
                  <qits-badge
                    [label]="event.name ?? ''"
                    [tone]="tone(event.name)"
                    [fieldOf]="event"
                    qitsField="name"
                  />
                </div>
                <p
                  class="m-0 text-sm wrap-anywhere text-fg-soft"
                  [fieldOf]="event"
                  [qitsField]="marks.gist"
                  data-lede
                >
                  {{ lede(event) }}
                </p>
                @let subjects = subjectsOf(event);
                @if (subjects.length) {
                  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-fg-soft">
                    @for (subject of subjects; track subject.kind + subject.label) {
                      <span
                        class="inline-flex items-baseline gap-1"
                        [fieldOf]="event"
                        [qitsField]="marks.subjects"
                      >
                        <span class="text-fg-muted">{{ kindLabel(subject) }}</span>
                        @if (subject.link?.exit === 'releaseRequest') {
                          <a
                            class="font-mono text-accent no-underline hover:underline"
                            [qitsExit]="opening.releaseRequest"
                            [exitParams]="{ slug: slug(), requestId: requestIdOf(subject) }"
                            >{{ subject.label }}</a
                          >
                        } @else {
                          <span class="font-mono text-fg">{{ subject.label }}</span>
                        }
                      </span>
                    }
                  </div>
                }
              </header>

              <dl
                class="mt-0 mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                aria-label="Facts"
                data-facts
              >
                <dt class="text-fg-muted">Occurred</dt>
                <dd class="m-0" [fieldOf]="event" [qitsField]="marks.occurredAt">
                  {{ instant(event.occurredAt) }}
                  <span class="ml-2 font-mono text-xs text-fg-muted">{{ event.occurredAt }}</span>
                </dd>
                <dt class="text-fg-muted">Recorded</dt>
                <dd class="m-0" [fieldOf]="event" [qitsField]="marks.createdAt">
                  {{ instant(event.createdAt) }}
                </dd>
                <dt class="text-fg-muted">Updated</dt>
                <dd class="m-0" [fieldOf]="event" [qitsField]="marks.updatedAt">
                  {{ instant(event.updatedAt) }}
                </dd>
                <dt class="text-fg-muted">Id</dt>
                <dd class="m-0 font-mono text-xs break-all" [fieldOf]="event" qitsField="id">
                  {{ event.id }}
                </dd>
                <dt class="text-fg-muted">Publisher</dt>
                <dd class="m-0 font-mono text-xs break-all" [fieldOf]="event" qitsField="publisher">
                  {{ event.publisher ?? '—' }}
                </dd>
                <dt class="text-fg-muted">Environment</dt>
                <dd class="m-0" [fieldOf]="event" [qitsField]="marks.environment">
                  @if (event.environment) {
                    {{ event.environment }}
                  } @else {
                    <span class="text-fg-muted">Recorded before the platform stamped tiers.</span>
                  }
                </dd>
                <dt class="text-fg-muted">Description</dt>
                <dd class="m-0 wrap-anywhere" [fieldOf]="event" [qitsField]="marks.description">
                  @if (event.description) {
                    {{ event.description }}
                  } @else {
                    <span class="text-fg-muted">None</span>
                  }
                </dd>
                <dt class="text-fg-muted">Cause</dt>
                <dd class="m-0" [fieldOf]="event" [qitsField]="marks.parentId" data-cause>
                  @if (event.parentId) {
                    <a
                      class="font-mono text-xs break-all text-accent no-underline hover:underline"
                      [qitsExit]="related.cause"
                      [exitParams]="{ slug: slug(), id: event.parentId }"
                      >{{ event.parentId }}</a
                    >
                  } @else {
                    <span class="text-fg-muted">Nothing in the log caused this event.</span>
                  }
                </dd>
              </dl>

              <section aria-labelledby="event-payload" class="mb-6">
                <h3 id="event-payload" class="mt-0 mb-2 text-base font-semibold">Payload</h3>
                <div [fieldOf]="event" [qitsField]="marks.payload" data-payload>
                  @let payload = payloadOf(event);
                  @switch (payload.kind) {
                    @case ('json') {
                      <ui-json-block
                        heading="JSON"
                        copyLabel="Copy payload"
                        [json]="payload.text"
                      />
                    }
                    @case ('raw') {
                      <ui-json-block
                        heading="Not JSON, as it arrived"
                        copyLabel="Copy payload"
                        [json]="payload.text"
                      />
                    }
                    @default {
                      <p class="m-0 text-sm text-fg-muted">This event carries no payload.</p>
                    }
                  }
                </div>
              </section>

              <section aria-labelledby="event-chain">
                <h3 id="event-chain" class="mt-0 mb-2 text-base font-semibold">Chain</h3>
                <ui-load-failure
                  message="This event’s chain could not be walked."
                  [class.hidden]="chainState() !== 'error'"
                  (retry)="chain.reload()"
                />
                <ui-spinner
                  [state]="chainState()"
                  class="min-h-24"
                  [class.hidden]="chainState() === 'error'"
                >
                  @if (walked(); as walked) {
                    <app-event-chain
                      [chain]="walked"
                      [rows]="walked.rows"
                      [projectId]="projectId()"
                      [slug]="slug()"
                      [exit]="related.chain"
                    />
                  }
                </ui-spinner>
              </section>
            </article>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectEventPage {
  private readonly selected = inject(SelectedProject);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** "← Events" (and "Back to Events" when there is no such event): the project's Events page. */
  protected readonly leaving = outcomes('leave-project-event', {
    back: exit('projects/:slug/events'),
  });
  /** The event's cause, and each other event of its chain: that event's page. */
  protected readonly related = outcomes('open-related-project-event', {
    cause: exit('projects/:slug/events/:id'),
    chain: exit('projects/:slug/events/:id'),
  });
  /** A release request the event names: its page. */
  protected readonly opening = outcomes('open-project-event-subject', {
    releaseRequest: exit('projects/:slug/releases/requests/:requestId'),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The event the address names. */
  protected readonly eventId = computed(() => this.params().get('id') ?? '');
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The open project's id, in the browser only: whether the event is the project's waits for it. */
  protected readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The event. */
  protected readonly read = qitsResource(PROJECT_EVENT, () => {
    const id = this.eventId();
    return this.browser && id ? { path: { id } } : undefined;
  });

  /** The event's answer, once there, and only for the event the address names. */
  private readonly answer = computed((): ProjectEventDetail | undefined => {
    const event = this.read.hasValue() ? this.read.value()?.event : undefined;
    return event && event.id === this.eventId() ? event : undefined;
  });

  /** Whether the event is the project's: its payload names the project. */
  private readonly belongs = computed(() => {
    const event = this.answer();
    return !!event && belongsToProject(event, this.projectId());
  });

  /** The event as the page shows it: read, and the project's. */
  protected readonly shown = computed(() => (this.belongs() ? this.answer() : undefined));

  /** No such event (a 404), or an event of another project. */
  protected readonly missing = computed(
    () => isMissing(this.read) || (!!this.answer() && !!this.projectId() && !this.belongs()),
  );

  /** Failed when the read failed (but for a 404, which is {@link missing}); loaded once shown. */
  protected readonly state = computed((): LoadState => {
    if (isMissing(this.read)) return 'loading';
    const read = loadState(this.read);
    return read === 'loaded' && !this.projectId() ? 'loading' : read;
  });

  /** The event's chain, walked once the event is shown; walked again by Retry. */
  protected readonly chain = resource({
    params: () => this.shown(),
    loader: ({ params }) => walkChain(params, PROJECT_CHAIN_READER),
  });

  /** The walked chain, once there, and only for the event the address names. */
  protected readonly walked = computed((): Chain | undefined => {
    const chain = this.chain.hasValue() ? this.chain.value() : undefined;
    const id = this.eventId();
    return chain?.rows.some((row) => row.kind === 'event' && row.current && row.event.id === id)
      ? chain
      : undefined;
  });

  /** The chain panel's state: failed, walked, else walking. */
  protected readonly chainState = computed((): LoadState => {
    if (this.chain.status() === 'error') return 'error';
    return this.walked() ? 'loaded' : 'loading';
  });

  protected readonly marks = MARKS;
  protected readonly instant = formatInstant;
  protected readonly tone = eventTone;

  /** The header's line: the repository · the gist. */
  protected lede(event: ProjectEventDetail): string {
    const gist = eventGist(event);
    return gist.repository ? `${gist.repository} · ${gist.summary}` : gist.summary;
  }

  /** What the event concerns, as the Events page's rows read it. */
  protected subjectsOf(event: ProjectEventDetail): readonly EventSubject[] {
    return eventSubjects(event, this.slug());
  }

  protected kindLabel(subject: EventSubject): string {
    switch (subject.kind) {
      case 'release-request':
        return 'request';
      case 'work-item':
        return 'item';
      default:
        return subject.kind;
    }
  }

  protected requestIdOf(subject: EventSubject): string {
    return subject.link?.exit === 'releaseRequest' ? subject.link.requestId : '';
  }

  protected payloadOf(event: ProjectEventDetail) {
    return renderPayload(event.payload);
  }
}
