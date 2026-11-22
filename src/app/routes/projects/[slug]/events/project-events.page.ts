import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { switchMap } from 'rxjs';
import { ALL, DomainEvents } from '$core/events/domain-events';
import type { EventNames, ProjectEventEntry } from '$core/events/events.consumes';
import { EVENT_NAMES, PROJECT_EVENTS_LIST } from '$core/events/events.operations';
import {
  eventDetail,
  eventSubjects,
  matchesProjectEvents,
  mergeEvents,
  NO_FILTER,
  parseFilterText,
  projectEventsQuery,
  SINCE_PRESETS,
  type EventSubject,
  type ProjectEventsFilter,
  type SincePreset,
} from '$core/events/project-events';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { relativeSince } from '$core/workspaces/agent-labels';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { JsonBlock } from '$ui/components/json-block/json-block';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** No stored names yet. */
const NO_NAMES: EventNames = { names: [] };

/**
 * A project's domain events (qits-2312), at `/projects/<slug>/events`: newest first, fifty at a
 * time, with "Load older" paging back by the answer's `nextCursor` until it is null.
 *
 * Each row names the event and when it happened (`formatInstant`, and how long ago), what it
 * concerns, read from its payload (`eventSubjects`: the repository, the release request, the work
 * items as `<slug>-<number>`, the branch, the agent), and links the request's and the items'
 * pages. Opening a row shows the whole event below it (`ui-json-block`: the envelope's fields and
 * the payload parsed from its JSON string).
 *
 * The filters are the page's own state, and each change reads the list again from the top
 * (`projectEventsQuery`): the types (`name=A,B`; the choice is every stored name, `EVENT_NAMES`,
 * and the names the list shows), how far back (Any, 1 h, 24 h, 7 d: `since`), an optional "until"
 * instant (`cursor=<until>,ffffffff-…`), and a text box whose `key=value` tokens are `attr`s (at most
 * seven besides the project's) and whose other words are `q`.
 *
 * Where it leads is declared (epic qits-2000): a row's Open link opens the event's own page
 * (`open-project-event` `event`, qits-2338), a release request a row names opens its page
 * (`open-project-event-subject` `releaseRequest`), a work item its page (`workItem`). An agent is
 * named but not linked: no recorded event names one, so no screenshot could follow the exit.
 *
 * It reads through its own `qitsResource`s over `PROJECT_EVENTS_LIST` and `EVENT_NAMES`, in the
 * browser only (the server render has no session), "Load older" through the operation's `fetch`,
 * and marks what it shows (qits-2141): the list is that read, each row an event by its id.
 *
 * Staleness (qits-1270): none needed; the live stream itself is what moves the list. `DomainEvents`
 * (the selected names, else every name) puts each frame about the project that the filters let
 * through (`matchesProjectEvents`) at the top, once; never while "until" is set. Paused, the frames
 * are held and counted ("N new"); resuming puts them at the top. A live frame is the same envelope
 * the list's pact binds (`LIST_PROJECT_EVENTS`).
 */
@Component({
  selector: 'app-project-events-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Dropdown,
    JsonBlock,
    LoadFailure,
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
      <app-page-layout title="Events">
        <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg">
          <ui-dropdown
            align="start"
            panelLabel="Event types"
            panelId="project-events-types"
            haspopup="dialog"
            triggerClass="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft"
          >
            <span dropdown-trigger>{{ typesLabel() }}</span>
            <fieldset
              dropdown-panel
              class="m-0 flex max-h-80 flex-col gap-1 overflow-y-auto border-0 px-3 py-2"
              [qitsEntityList]="names"
            >
              <legend class="sr-only">Event types</legend>
              @for (name of typeChoices(); track name) {
                <label
                  class="flex items-center gap-2 text-sm text-fg"
                  [fieldOf]="namesAnswer()"
                  [qitsField]="{ derived: ['names'] }"
                >
                  <input
                    type="checkbox"
                    [checked]="filter().names.includes(name)"
                    (change)="toggleName(name, checked($event))"
                  />
                  {{ name }}
                </label>
              } @empty {
                <p class="m-0 text-sm text-fg-muted">No event types yet</p>
              }
            </fieldset>
          </ui-dropdown>
          <div class="flex gap-1" role="group" aria-label="Since">
            @for (preset of presets; track preset.value) {
              <button
                type="button"
                class="h-7 cursor-pointer rounded-md border px-2 text-xs font-semibold"
                [class]="
                  filter().since === preset.value
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-line bg-surface text-fg-soft'
                "
                [attr.aria-pressed]="filter().since === preset.value"
                (click)="setSince(preset.value)"
              >
                {{ preset.label }}
              </button>
            }
          </div>
          <label class="flex items-center gap-2 text-xs text-fg-soft">
            Until
            <input
              type="datetime-local"
              step="1"
              class="h-7 rounded-md border border-line bg-surface px-1 text-xs text-fg"
              aria-label="Until"
              [value]="untilInput()"
              (change)="setUntil(inputValue($event))"
            />
          </label>
          @if (filter().until) {
            <button
              type="button"
              class="h-7 cursor-pointer rounded-md border border-line bg-surface px-2 text-xs text-fg-soft"
              (click)="setUntil('')"
            >
              Clear until
            </button>
          }
          <input
            type="search"
            class="h-7 min-w-48 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-fg"
            aria-label="Filter events"
            placeholder="Text, or key=value"
            [value]="filter().text"
            (keydown.enter)="setText(inputValue($event))"
            (change)="setText(inputValue($event))"
          />
        </div>
        <div class="mb-3 flex flex-wrap items-center gap-3 text-xs text-fg-soft">
          @if (filter().until) {
            <span>Live updates are off while “until” is set.</span>
          } @else {
            <button
              type="button"
              class="h-7 cursor-pointer rounded-md border border-line bg-surface px-2 font-semibold text-fg-soft"
              [attr.aria-pressed]="paused()"
              (click)="togglePause()"
            >
              {{ paused() ? 'Resume live' : 'Pause live' }}
            </button>
            @if (paused()) {
              <span aria-live="polite">{{ held().length }} new</span>
            } @else {
              <span>Live</span>
            }
          }
          @if (droppedAttrs(); as dropped) {
            <span class="text-warning-strong"
              >{{ dropped }} key=value filter{{ dropped === 1 ? '' : 's' }} past the seventh left
              out</span
            >
          }
        </div>
        <ui-load-failure
          message="This project’s events could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul
            class="m-0 flex list-none flex-col gap-2 p-0"
            aria-label="Events"
            [qitsEntityList]="events"
          >
            @for (event of shown(); track event.id) {
              <li
                class="flex flex-col gap-1 rounded-md border border-line bg-surface px-3 py-2"
                [qitsEntity]="event"
                entityKey="id"
              >
                <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <button
                    type="button"
                    class="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-0.5 border-0 bg-transparent p-0 text-left"
                    [attr.aria-expanded]="isOpen(event.id)"
                    [attr.aria-controls]="'event-' + event.id"
                    (click)="toggleOpen(event.id)"
                  >
                    <span
                      class="font-semibold break-all text-fg"
                      [fieldOf]="event"
                      qitsField="name"
                      >{{ event.name }}</span
                    >
                    <span
                      class="text-xs text-fg-muted tabular-nums"
                      [fieldOf]="event"
                      [qitsField]="{ derived: ['occurredAt'] }"
                      >{{ when(event.occurredAt) }}</span
                    >
                  </button>
                  <a
                    class="text-xs font-semibold text-accent no-underline hover:underline"
                    [qitsExit]="viewing.event"
                    [exitParams]="{ slug: slug(), id: event.id ?? '' }"
                    [attr.aria-label]="'Open event ' + event.id"
                    >Open</a
                  >
                </div>
                @let subjects = subjectsOf(event);
                @if (subjects.length) {
                  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-fg-soft">
                    @for (subject of subjects; track subject.kind + subject.label) {
                      <span
                        class="inline-flex items-baseline gap-1"
                        [fieldOf]="event"
                        [qitsField]="subjectMark"
                      >
                        <span class="text-fg-muted">{{ kindLabel(subject) }}</span>
                        @switch (subject.link?.exit) {
                          @case ('releaseRequest') {
                            <a
                              class="font-mono text-accent no-underline hover:underline"
                              [qitsExit]="opening.releaseRequest"
                              [exitParams]="{ slug: slug(), requestId: requestIdOf(subject) }"
                              >{{ subject.label }}</a
                            >
                          }
                          @case ('workItem') {
                            <a
                              class="font-mono text-accent no-underline hover:underline"
                              [qitsExit]="opening.workItem"
                              [exitParams]="{ slug: slug(), id: workIdOf(subject) }"
                              >{{ subject.label }}</a
                            >
                          }
                          @default {
                            <span class="font-mono text-fg">{{ subject.label }}</span>
                          }
                        }
                      </span>
                    }
                  </div>
                }
                @if (isOpen(event.id)) {
                  <ui-json-block
                    class="mt-1"
                    heading="Event"
                    copyLabel="Copy event"
                    [attr.id]="'event-' + event.id"
                    [json]="detailOf(event)"
                    [fieldOf]="event"
                    [qitsField]="detailMark"
                  />
                }
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && shown().length === 0 ? 'block' : 'hidden'"
          >
            No events for this project match.
          </p>
          @if (cursor()) {
            <div class="mt-3 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                class="h-8 cursor-pointer rounded-md border border-line bg-surface px-3 text-sm font-semibold text-fg-soft disabled:cursor-default disabled:opacity-60"
                [disabled]="loadingOlder()"
                (click)="loadOlder()"
              >
                {{ loadingOlder() ? 'Loading…' : 'Load older' }}
              </button>
              @if (olderFailed()) {
                <span role="alert" class="text-sm text-danger"
                  >The older events could not be read.</span
                >
              }
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectEventsPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** A release request or a work item a row names: its page. */
  protected readonly opening = outcomes('open-project-event-subject', {
    releaseRequest: exit('projects/:slug/releases/requests/:requestId'),
    workItem: exit('projects/:slug/work/detail/:id'),
  });

  /** A row's event: its own page (qits-2338). */
  protected readonly viewing = outcomes('open-project-event', {
    event: exit('projects/:slug/events/:id'),
  });

  /** The marks over values a helper derives from the event (class constants, which the rule trusts). */
  protected readonly subjectMark = { derived: ['payload'] } as const;
  protected readonly detailMark = {
    derived: ['id', 'name', 'occurredAt', 'publisher', 'environment', 'parentId', 'payload'],
  } as const;

  protected readonly presets = SINCE_PRESETS;
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The filters: each change reads the list again from the top. */
  protected readonly filter = signal<ProjectEventsFilter>(NO_FILTER);

  /** The open project's id, in the browser only: the reads wait for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The first page's query; its `since` is taken from the clock when the filters change. */
  private readonly query = computed(() => {
    const project = this.projectId();
    return project ? projectEventsQuery(project, this.filter(), Date.now()) : undefined;
  });

  /** The project's newest events under the filters: the first page. */
  protected readonly events = qitsResource(PROJECT_EVENTS_LIST, () => {
    const query = this.query();
    return query ? { query } : undefined;
  });

  /** Every stored event name, for the type filter. */
  protected readonly names = qitsResource(EVENT_NAMES, () => (this.browser ? {} : undefined));

  /** The stored names' answer, for the type filter's marks; no names until it answered. */
  protected readonly namesAnswer = computed(
    (): EventNames => (this.names.hasValue() ? this.names.value() : undefined) ?? NO_NAMES,
  );

  /** The older pages "Load older" read, oldest last; none again once the first page is read anew. */
  private readonly older = linkedSignal<unknown, readonly ProjectEventEntry[]>({
    source: () => (this.events.hasValue() ? this.events.value() : undefined),
    computation: () => [],
  });

  /** The next older page's cursor: the last page's `nextCursor`, null on the last page. */
  protected readonly cursor = linkedSignal<unknown, string | null>({
    source: () => (this.events.hasValue() ? this.events.value() : undefined),
    computation: () => (this.events.hasValue() ? (this.events.value()?.nextCursor ?? null) : null),
  });

  protected readonly loadingOlder = signal(false);
  protected readonly olderFailed = linkedSignal({ source: this.query, computation: () => false });

  /** The live frames put at the top since the list was read under these filters, newest first. */
  private readonly arrived = linkedSignal<unknown, readonly ProjectEventEntry[]>({
    source: this.query,
    computation: () => [],
  });
  /** The live frames held while paused, newest first. */
  protected readonly held = linkedSignal<unknown, readonly ProjectEventEntry[]>({
    source: this.query,
    computation: () => [],
  });
  protected readonly paused = signal(false);

  /** The rows opened to their detail, by event id. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  /** What the list shows: the arrivals, then the pages read, each id once. */
  protected readonly shown = computed((): readonly ProjectEventEntry[] =>
    mergeEvents(this.arrived(), [
      ...(this.events.hasValue() ? (this.events.value()?.events ?? []) : []),
      ...this.older(),
    ]),
  );

  protected readonly state = computed((): LoadState => loadState(this.events));

  /** The type filter's choices: every stored name and every name the list shows, sorted. */
  protected readonly typeChoices = computed((): readonly string[] => {
    const stored = this.names.hasValue() ? (this.names.value()?.names ?? []) : [];
    const listed = this.shown().map((event) => event.name ?? '');
    return [...new Set([...stored, ...listed, ...this.filter().names])].filter(Boolean).sort();
  });

  protected readonly typesLabel = computed(() => {
    const names = this.filter().names;
    if (names.length === 0) return 'All types';
    return names.length === 1 ? names[0] : `${names.length} types`;
  });

  /** The "until" instant as the input shows it: local time, to the second. */
  protected readonly untilInput = computed(() => {
    const until = this.filter().until;
    if (!until) return '';
    const date = new Date(until);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 19);
  });

  protected readonly droppedAttrs = computed(() => parseFilterText(this.filter().text).dropped);

  constructor() {
    const live = inject(DomainEvents);
    toObservable(computed(() => this.filter().names))
      .pipe(
        switchMap((names) => live.on(names.length ? names : [ALL])),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((event) => this.arrive(event as ProjectEventEntry));
  }

  /**
   * A live frame: put at the top (or held, while paused) when it is about the project, the filters
   * let it through, "until" is not set and it is not listed yet.
   */
  private arrive(event: ProjectEventEntry): void {
    const project = this.projectId();
    const filter = this.filter();
    if (!project || filter.until || !this.events.hasValue()) return;
    if (!matchesProjectEvents(event, project, filter)) return;
    const known = (list: readonly ProjectEventEntry[]) => list.some((e) => e.id === event.id);
    if (known(this.shown()) || known(this.held())) return;
    if (this.paused()) this.held.update((held) => [event, ...held]);
    else this.arrived.update((arrived) => [event, ...arrived]);
  }

  protected togglePause(): void {
    if (this.paused()) {
      const held = this.held();
      this.held.set([]);
      this.arrived.update((arrived) => [...held, ...arrived]);
    }
    this.paused.update((paused) => !paused);
  }

  /** The next older page, appended; a failure says so beside the button. */
  protected async loadOlder(): Promise<void> {
    const query = this.query();
    const cursor = this.cursor();
    if (!query || !cursor || this.loadingOlder()) return;
    this.loadingOlder.set(true);
    this.olderFailed.set(false);
    const { data, error } = await PROJECT_EVENTS_LIST.fetch({ query: { ...query, cursor } });
    this.loadingOlder.set(false);
    if (this.query() !== query) return;
    if (error !== undefined || !data) {
      this.olderFailed.set(true);
      return;
    }
    this.older.update((older) => [...older, ...(data.events ?? [])]);
    this.cursor.set(data.nextCursor ?? null);
  }

  protected toggleName(name: string, on: boolean): void {
    this.filter.update((filter) => ({
      ...filter,
      names: on
        ? [...filter.names.filter((n) => n !== name), name]
        : filter.names.filter((n) => n !== name),
    }));
  }

  protected setSince(since: SincePreset): void {
    if (this.filter().since !== since) this.filter.update((filter) => ({ ...filter, since }));
  }

  /** The "until" input's local date and time, as an instant; empty clears it. */
  protected setUntil(value: string): void {
    const date = value ? new Date(value) : undefined;
    const until = date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
    if (this.filter().until !== until) this.filter.update((filter) => ({ ...filter, until }));
  }

  protected setText(text: string): void {
    const trimmed = text.trim();
    if (this.filter().text !== trimmed)
      this.filter.update((filter) => ({ ...filter, text: trimmed }));
  }

  protected isOpen(id: string | undefined): boolean {
    return !!id && this.opened().has(id);
  }

  protected toggleOpen(id: string | undefined): void {
    if (!id) return;
    this.opened.update((opened) => {
      const next = new Set(opened);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** When an event happened: the instant, and how long ago. */
  protected when(iso: string | undefined): string {
    return iso ? `${formatInstant(iso)} · ${relativeSince(iso)}` : '';
  }

  /** What a row's event concerns. */
  protected subjectsOf(event: ProjectEventEntry): readonly EventSubject[] {
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

  protected workIdOf(subject: EventSubject): string {
    return subject.link?.exit === 'workItem' ? subject.link.id : '';
  }

  protected detailOf(event: ProjectEventEntry): string {
    return eventDetail(event);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected retry(): void {
    this.events.reload();
  }
}
