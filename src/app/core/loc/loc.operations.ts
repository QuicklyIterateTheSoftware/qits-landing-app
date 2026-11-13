import { qitsOperation } from '@qits/angular';
import { listLoc } from '../../api/githost';
import { LIST_LOC } from './loc.consumes';

/**
 * qits-githost's lines-of-code read declared as an operation (qits-2145), for `LinesOfCode`, which
 * reads through `qitsResource` instead of `LocStore` (qits-2146); `loc.operations.pact.spec.ts`
 * binds it with the same provider, operationId and `consumes`.
 */

/** Every repository's lines of code (`listLoc` without a filter): one read for every card. */
export const LOC_LIST = qitsOperation({
  provider: 'qits-githost-service',
  operationId: 'listLoc',
  method: 'GET',
  call: listLoc,
  consumes: LIST_LOC,
});
