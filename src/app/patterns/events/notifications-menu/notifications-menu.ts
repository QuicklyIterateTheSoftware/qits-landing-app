import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ALL, DomainEvents } from '../../../core/events/domain-events';
import { EventsStore } from '../../../core/events/events.store';
import { Dropdown } from '../../../ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '../../../ui/components/spinner/spinner';

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
 * The events are fetched the first time the menu opens, never before (`EventsStore.load`). Once
 * they are, every event the live stream brings (`DomainEvents`) is put at the top. The button and
 * the panel are `ui-dropdown`'s; the list scrolls inside the panel.
 */
@Component({
  selector: 'app-notifications-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, Spinner],
  host: { class: 'inline-flex' },
  template: `
    <ui-dropdown
      label="Notifications"
      panelLabel="Recent domain events"
      panelId="notifications-menu"
      (opened)="store.load()"
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
        <ul class="m-0 max-h-96 list-none overflow-y-auto p-0">
          @for (event of store.recent(); track event.id) {
            <li class="flex flex-col gap-0.5 border-b border-gray-100 px-3 py-2 last:border-b-0">
              <div class="flex items-baseline justify-between gap-2">
                <span class="truncate text-sm font-semibold text-gray-900">{{ event.name }}</span>
                <span class="shrink-0 text-[0.6875rem] text-gray-500 tabular-nums">{{
                  time(event.occurredAt)
                }}</span>
              </div>
              <span class="truncate text-[0.8125rem] text-gray-600">{{ event.description }}</span>
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-gray-500"
          [class.hidden]="state() !== 'loaded' || store.recent().length > 0"
        >
          No events yet
        </p>
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class NotificationsMenu {
  protected readonly store = inject(EventsStore);

  protected readonly time = eventTime;

  constructor() {
    inject(DomainEvents)
      .on([ALL])
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((event) => {
        if (this.store.status() === 'loaded') this.store.prepend(event);
      });
  }

  protected readonly state = computed((): LoadState => {
    const status = this.store.status();
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });
}
