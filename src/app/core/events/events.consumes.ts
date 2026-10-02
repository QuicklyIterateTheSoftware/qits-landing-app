import type { ListEventsResponses } from '../../api/events';
import type { Consumed } from '@qits/angular';

/**
 * What `EventsStore` reads from qits-events' answer (epic qits-112). The store passes this to
 * `consume(...)`, so it cannot read any other field, and its pact spec passes the same list as
 * `consumes`. To read another field, add it here.
 */

/** How many events the notifications menu lists: the newest, one page. */
export const RECENT_EVENTS = 20;

/**
 * `EventsStore.load()`: the newest events, for the notifications menu. Each row shows the event's
 * name, when it happened and its one-line description. The same shape is what `DomainEvents`
 * hands its subscribers from the live stream (qits-events serializes one envelope for both), and
 * they filter on the `payload` (its `projectId`, for one), so it is read here too: the list's pact
 * is what binds the envelope.
 */
export const LIST_EVENTS = [
  'events[].id',
  'events[].name',
  'events[].occurredAt',
  'events[].description',
  'events[].payload',
] as const;

/** One domain event, cut to what the store and `DomainEvents` read. */
export type EventEntry = NonNullable<
  Consumed<ListEventsResponses[200], typeof LIST_EVENTS>['events']
>[number];
