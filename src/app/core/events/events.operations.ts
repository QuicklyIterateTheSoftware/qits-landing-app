import { qitsOperation } from '@qits/angular';
import { listEventNames, listEvents } from '../../api/events';
import { LIST_EVENT_NAMES, LIST_EVENTS, LIST_PROJECT_EVENTS } from './events.consumes';

/**
 * qits-events' reads declared as operations (qits-2145), for the top bar's notifications menu,
 * which reads through `qitsResource` instead of a store (qits-2146), and a project's Events page
 * (qits-2312); `events.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`.
 */

/** The platform's newest domain events (`listEvents?limit=`), the notifications menu's list. */
export const RECENT_EVENTS_LIST = qitsOperation({
  provider: 'qits-events-service',
  operationId: 'listEvents',
  method: 'GET',
  call: listEvents,
  consumes: LIST_EVENTS,
});

/**
 * A project's events (`listEvents?attr=projectid=<id>&order=desc&limit=50`, and the page's filters:
 * `name`, `since`, `q`, further `attr`s and `cursor`), built by `projectEventsQuery`
 * (`project-events.ts`): the Events page's list, and its "Load older" pages (`fetch`).
 */
export const PROJECT_EVENTS_LIST = qitsOperation({
  provider: 'qits-events-service',
  operationId: 'listEvents',
  method: 'GET',
  call: listEvents,
  consumes: LIST_PROJECT_EVENTS,
});

/** Every stored event name (`listEventNames`): the Events page's type filter. */
export const EVENT_NAMES = qitsOperation({
  provider: 'qits-events-service',
  operationId: 'listEventNames',
  method: 'GET',
  call: listEventNames,
  consumes: LIST_EVENT_NAMES,
});
