import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listEvents } from '../../api/events';
import { LIST_EVENTS, RECENT_EVENTS, type EventEntry } from './events.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

interface EventsState {
  readonly status: Status;
  /** The newest events, newest first, at most {@link RECENT_EVENTS}. */
  readonly recent: readonly EventEntry[];
}

/**
 * The platform's newest domain events, from qits-events (epic qits-112), for the notifications menu.
 *
 * - `load()` fetches the newest {@link RECENT_EVENTS} once, and again after an error. Nothing calls it
 *   on its own: the menu does, the first time it opens.
 * - `prepend(event)` puts an event that arrived later at the top, keeping at most
 *   {@link RECENT_EVENTS} and never the same id twice.
 */
export const EventsStore = signalStore(
  { providedIn: 'root' },
  withState<EventsState>({ status: 'idle', recent: [] }),
  withMethods((store) => ({
    async load(): Promise<void> {
      if (store.status() === 'loading' || store.status() === 'loaded') return;
      patchState(store, { status: 'loading' });
      const { data, error } = await consume(
        listEvents({ query: { limit: String(RECENT_EVENTS) } }),
        LIST_EVENTS,
      );
      patchState(
        store,
        error !== undefined || !data
          ? { status: 'error', recent: [] }
          : { status: 'loaded', recent: (data.events ?? []).slice(0, RECENT_EVENTS) },
      );
    },
    prepend(event: EventEntry): void {
      const rest = store.recent().filter((e) => e.id !== event.id);
      patchState(store, { recent: [event, ...rest].slice(0, RECENT_EVENTS) });
    },
  })),
);
