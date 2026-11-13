import { qitsOperation } from '@qits/angular';
import { listDeskTriggerMessages } from '../../api/projects';
import { LIST_DESK_TRIGGER_MESSAGES } from './desk-triggers.consumes';

/**
 * qits-projects' delivery desk reads declared as operations (qits-2145), for the Desk page, which
 * reads through `qitsResource` in place of the former `DeskTriggersStore` (qits-2146);
 * `desk.operations.pact.spec.ts` binds each with the same provider, operationId and `consumes`.
 */

/**
 * The messages the project's delivery desk was sent by its desk triggers (epic qits-1604),
 * newest `openedAt` first: every window's state, delivery bookkeeping and the lines it collected.
 */
export const DESK_TRIGGER_MESSAGES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listDeskTriggerMessages',
  method: 'GET',
  call: listDeskTriggerMessages,
  consumes: LIST_DESK_TRIGGER_MESSAGES,
});
