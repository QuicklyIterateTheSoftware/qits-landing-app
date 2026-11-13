import { qitsOperation } from '@qits/angular';
import { listProjectWork } from '../../api/projects';
import { PROJECT_CARD_WORK as PROJECT_CARD_WORK_PATHS } from './work.consumes';

/**
 * qits-projects' work reads declared as operations (qits-2145), for the components that read
 * through `qitsResource` instead of `WorkStore` (qits-2146); `work.operations.pact.spec.ts` binds
 * each with the same provider, operationId and `consumes`.
 */

/**
 * A project's planning tree (`listProjectWork`), as a project card reads it: how many of its
 * entries count as work (`countsAsWork`).
 */
export const PROJECT_CARD_WORK = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectWork',
  method: 'GET',
  call: listProjectWork,
  consumes: PROJECT_CARD_WORK_PATHS,
});
