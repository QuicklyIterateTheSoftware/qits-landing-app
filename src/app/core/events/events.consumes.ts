import type {
  GetEventResponses,
  ListEventNamesResponses,
  ListEventsResponses,
} from '../../api/events';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from qits-events' answer (epic qits-112). The operation over it
 * (`RECENT_EVENTS_LIST`, `events.operations.ts`) narrows the answer to this list, so nothing can
 * read any other field, and its pact spec passes the same list as `consumes`. To read another
 * field, add it here.
 */

/** How many events the notifications menu lists: the newest, one page. */
export const RECENT_EVENTS = 20;

/**
 * `RECENT_EVENTS_LIST`: the newest events, for the notifications menu. Each row shows the event's
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

/** One domain event, cut to what the menu and `DomainEvents` read. */
export type EventEntry = NonNullable<
  Consumed<ListEventsResponses[200], typeof LIST_EVENTS>['events']
>[number];

/** How many events a project's Events page reads at a time (qits-2312): one page, `limit=50`. */
export const PROJECT_EVENTS_PAGE = 50;

/**
 * `PROJECT_EVENTS_LIST`: a project's events, newest first, one page at a time (qits-2312). Each row
 * shows the event's name and when it happened, what it concerns (read from its `payload`), and,
 * opened, the whole envelope: its `publisher`, `environment` and `parentId` too. `nextCursor` is
 * the next (older) page's cursor, null on the last.
 */
export const LIST_PROJECT_EVENTS = [
  'events[].id',
  'events[].name',
  'events[].occurredAt',
  'events[].payload',
  'events[].publisher',
  'events[].environment',
  'events[].parentId',
  'nextCursor',
] as const;

/** One of a project's events, cut to what the Events page reads. */
export type ProjectEventEntry = NonNullable<
  Consumed<ListEventsResponses[200], typeof LIST_PROJECT_EVENTS>['events']
>[number];

/** `EVENT_NAMES`: every event name qits-events has stored, the Events page's type filter. */
export const LIST_EVENT_NAMES = ['names'] as const;

/** The names' answer, cut to what the type filter reads. */
export type EventNames = Consumed<ListEventNamesResponses[200], typeof LIST_EVENT_NAMES>;

/**
 * `PROJECT_EVENT`: one event by its id (`getEvent`), an event's page (qits-2338) and each hop its
 * chain walks up by `parentId`. The page shows the whole envelope: its name, when it happened, was
 * recorded and last updated, its publisher, environment and description, its cause (`parentId`)
 * and its payload (whose `projectId`s also say whether it is the project's).
 */
export const GET_PROJECT_EVENT = [
  'event.id',
  'event.name',
  'event.occurredAt',
  'event.payload',
  'event.description',
  'event.parentId',
  'event.environment',
  'event.createdAt',
  'event.updatedAt',
  'event.publisher',
] as const;

/** One event, cut to what its page reads. */
export type ProjectEventDetail = NonNullable<
  Consumed<GetEventResponses[200], typeof GET_PROJECT_EVENT>['event']
>;

/**
 * `EVENT_CHILDREN`: the events one event caused (`listEvents?parentId=`), each level of an event's
 * chain walking down (qits-2338). A row shows its time, name, repository and gist (read from its
 * `payload`, else its `description`), and links its own page when it is the project's. Not paged:
 * an event causes a handful at most.
 */
export const LIST_EVENT_CHILDREN = [
  'events[].id',
  'events[].name',
  'events[].occurredAt',
  'events[].payload',
  'events[].description',
  'events[].parentId',
] as const;

/** One event another caused, cut to what the chain reads. */
export type EventChild = NonNullable<
  Consumed<ListEventsResponses[200], typeof LIST_EVENT_CHILDREN>['events']
>[number];
