import { qitsOperation } from '@qits/angular';
import { getEvent, listEventNames, listEvents } from '../../api/events';
import {
  GET_PROJECT_EVENT,
  LIST_EVENT_CHILDREN,
  LIST_EVENT_NAMES,
  LIST_EVENTS,
  LIST_PROJECT_EVENTS,
} from './events.consumes';

/**
 * qits-events' reads declared as operations (qits-2145), for the top bar's notifications menu,
 * which reads through `qitsResource` instead of a store (qits-2146), a project's Events page
 * (qits-2312) and an event's page with its chain (qits-2338); `events.operations.pact.spec.ts`
 * binds each with the same provider, operationId and `consumes`.
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

/**
 * One event by its id (`getEvent`, `/events/api/events/{id}`): an event's page (qits-2338), and
 * each hop its chain walks up by `parentId` (`fetch`). An id qits-events does not hold is a 404,
 * which the page says as "No event <id> in this project." and the chain reads as its start.
 */
export const PROJECT_EVENT = qitsOperation({
  provider: 'qits-events-service',
  operationId: 'getEvent',
  method: 'GET',
  call: getEvent,
  consumes: GET_PROJECT_EVENT,
});

/**
 * The events one event caused (`listEvents?parentId=<id>`), each node of an event's chain walking
 * down from its start (qits-2338, `fetch`). An id that caused nothing, or is not held at all, is an
 * empty list.
 */
export const EVENT_CHILDREN = qitsOperation({
  provider: 'qits-events-service',
  operationId: 'listEvents',
  method: 'GET',
  call: listEvents,
  consumes: LIST_EVENT_CHILDREN,
});
