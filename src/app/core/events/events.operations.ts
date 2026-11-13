import { qitsOperation } from '@qits/angular';
import { listEvents } from '../../api/events';
import { LIST_EVENTS } from './events.consumes';

/**
 * qits-events' reads declared as operations (qits-2145), for the top bar's notifications menu,
 * which reads through `qitsResource` instead of a store (qits-2146); `events.operations.pact.spec.ts`
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
