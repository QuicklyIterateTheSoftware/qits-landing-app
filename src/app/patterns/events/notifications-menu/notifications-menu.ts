import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { ALL, DomainEvents } from '$core/events/domain-events';
import { RECENT_EVENTS, type EventEntry } from '$core/events/events.consumes';
import { RECENT_EVENTS_LIST } from '$core/events/events.operations';
import { loadState } from '$core/resources/load-state';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** An instant as `2026-01-01 00:00 UTC`: the same on every machine, so screenshots are stable. */
export function eventTime(instant: string | undefined): string {
  if (!instant) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * The top bar's notifications menu: the platform's newest domain events (qits-events), newest
 * first. Always shown, because events are platform-wide, not a project's.
 *
 * The events are read the first time the menu opens, never before, and again on an opening after
 * a failure: its own `qitsResource` over `RECENT_EVENTS_LIST` (qits-2146; the menu is its one
 * reader, mounted in the shell for the app's lifetime). Once they are, every event the live stream
 * brings (`DomainEvents`) is put at the top, once, keeping the newest {@link RECENT_EVENTS}. The
 * button and the panel are `ui-dropdown`'s; the list scrolls inside the panel.
 *
 * What it shows carries the data marks (qits-2141): the list its read (`qitsEntityList`), each row
 * its event (`qitsEntity`, by `id`; a live one is the same envelope the list's pact binds), each
 * value its field or the fields it is derived from (`qitsField`).
 *
 * Staleness (qits-1270): none needed; the live stream itself is what moves the list.
 */
@Component({
  selector: 'app-notifications-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'inline-flex' },
  template: `
    <ui-dropdown
      label="Notifications"
      panelLabel="Recent domain events"
      panelId="notifications-menu"
      (opened)="open()"
    >
      <svg
        dropdown-trigger
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M4 4h16v12H9l-5 4V4z" />
      </svg>
      <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
        <ul class="m-0 max-h-96 list-none overflow-y-auto p-0" [qitsEntityList]="events">
          @for (event of recent(); track event.id) {
            <li
              class="flex flex-col gap-0.5 border-b border-line-subtle px-3 py-2 last:border-b-0"
              [qitsEntity]="event"
              entityKey="id"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span
                  class="truncate text-sm font-semibold text-fg"
                  [fieldOf]="event"
                  qitsField="name"
                  >{{ event.name }}</span
                >
                <span
                  class="shrink-0 text-[0.6875rem] text-fg-muted tabular-nums"
                  [fieldOf]="event"
                  [qitsField]="{ derived: ['occurredAt'] }"
                  >{{ time(event.occurredAt) }}</span
                >
              </div>
              <span
                class="truncate text-[0.8125rem] text-fg-soft"
                [fieldOf]="event"
                qitsField="description"
                >{{ event.description }}</span
              >
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-fg-muted"
          [class.hidden]="state() !== 'loaded' || recent().length > 0"
        >
          No events yet
        </p>
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class NotificationsMenu {
  /** Whether the menu has been opened: nothing is read before. */
  private readonly asked = signal(false);

  /** The newest events, read on the first opening (and in the browser only: nobody opens it on the server). */
  protected readonly events = qitsResource(RECENT_EVENTS_LIST, () =>
    this.asked() ? { query: { limit: String(RECENT_EVENTS) } } : undefined,
  );

  /** The events the live stream brought since the list loaded, newest first. */
  private readonly arrived = signal<readonly EventEntry[]>([]);

  /** What the menu lists: the arrivals, then the list, each id once, at most the newest 20. */
  protected readonly recent = computed((): readonly EventEntry[] => {
    const listed = this.events.hasValue() ? (this.events.value()?.events ?? []) : [];
    const seen = new Set<string | undefined>();
    return [...this.arrived(), ...listed]
      .filter((event) => !seen.has(event.id) && !!seen.add(event.id))
      .slice(0, RECENT_EVENTS);
  });

  protected readonly time = eventTime;

  constructor() {
    inject(DomainEvents)
      .on([ALL])
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((event) => {
        if (!this.events.hasValue()) return;
        this.arrived.update((arrived) =>
          [event, ...arrived.filter((e) => e.id !== event.id)].slice(0, RECENT_EVENTS),
        );
      });
  }

  protected readonly state = computed((): LoadState => loadState(this.events));

  /** On an opening: the first reads the events, one after a failure reads them again. */
  protected open(): void {
    if (!this.asked()) this.asked.set(true);
    else if (this.events.status() === 'error') this.events.reload();
  }
}
