import type { ListDeskTriggerMessagesResponses } from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `DeskTriggersStore` reads from qits-projects' answer (epic qits-1604). The store passes
 * this list to `consume(...)`, so it cannot read any other field, and its pact spec passes the
 * same list as `consumes`. To read another field, add it here.
 */
export const LIST_DESK_TRIGGER_MESSAGES = [
  'messages[].id',
  'messages[].state',
  'messages[].openedAt',
  'messages[].closesAt',
  'messages[].closedAt',
  'messages[].acceptedAt',
  'messages[].attempts',
  'messages[].lastStatus',
  'messages[].lastDetail',
  'messages[].commandId',
  'messages[].queuePosition',
  'messages[].message',
  'messages[].events[].source',
  'messages[].events[].itemRef',
  'messages[].events[].itemId',
  'messages[].events[].label',
  'messages[].events[].cause',
  'messages[].events[].eventId',
  'messages[].events[].occurredAt',
] as const;

/** One desk trigger window, cut to what the page reads. */
export type DeskTriggerMessage = NonNullable<
  Consumed<ListDeskTriggerMessagesResponses[200], typeof LIST_DESK_TRIGGER_MESSAGES>['messages']
>[number];

/** One line a window collected, cut to what the page reads. */
export type DeskTriggerEvent = NonNullable<DeskTriggerMessage['events']>[number];
