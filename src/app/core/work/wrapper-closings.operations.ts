import { qitsOperation } from '@qits/angular';
import { listWrapperClosings } from '../../api/projects';
import { LIST_WRAPPER_CLOSINGS } from './work.consumes';

/**
 * Where each VERIFIED ticket of a project stands on its way to DONE (`listWrapperClosings`,
 * qits-1873; qits-2146, in place of `WrapperClosingsStore`). `wrapper-closings.operations.pact.spec.ts`
 * binds it.
 */
export const WRAPPER_CLOSINGS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listWrapperClosings',
  method: 'GET',
  call: listWrapperClosings,
  consumes: LIST_WRAPPER_CLOSINGS,
});
