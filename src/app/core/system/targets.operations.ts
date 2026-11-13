import { qitsOperation } from '@qits/angular';
import { listTargets } from '../../api/system';
import { LIST_TARGETS } from './targets.consumes';

/**
 * qits-system's execution targets (epic qits-112) declared as an operation (qits-2145), read by the
 * lightning menu's runners and slots line (`app-runner-slots`) through its own `qitsResource`
 * (qits-2146; `TargetsStore` read them before); `targets.operations.pact.spec.ts` binds it.
 */
export const TARGET_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listTargets',
  method: 'GET',
  call: listTargets,
  consumes: LIST_TARGETS,
});
