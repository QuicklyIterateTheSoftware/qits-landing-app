import { qitsOperation } from '@qits/angular';
import { listProjectWorkBriefs } from '../../api/projects';
import { LIST_PROJECT_WORK_BRIEFS } from './work-briefs.consumes';

/**
 * The briefs of the work items a text names (`listProjectWorkBriefs`, qits-1897; qits-2146): the
 * source `@qits/ui-components`' work references read through (`work-briefs.ts`).
 * `work-briefs.operations.pact.spec.ts` binds it.
 */
export const WORK_BRIEFS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectWorkBriefs',
  method: 'GET',
  call: listProjectWorkBriefs,
  consumes: LIST_PROJECT_WORK_BRIEFS,
});
