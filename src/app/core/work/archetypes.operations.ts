import { qitsOperation } from '@qits/angular';
import { listWorkArchetypes } from '../../api/projects';
import { LIST_WORK_ARCHETYPES } from './archetypes.consumes';

/**
 * qits-projects' archetype registry (`listWorkArchetypes`, qits-2146, in place of
 * `ArchetypesStore`): each archetype's moves out of each status and what a dispatch press runs
 * from it. `archetypes.operations.pact.spec.ts` binds it.
 */
export const WORK_ARCHETYPES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listWorkArchetypes',
  method: 'GET',
  call: listWorkArchetypes,
  consumes: LIST_WORK_ARCHETYPES,
});
