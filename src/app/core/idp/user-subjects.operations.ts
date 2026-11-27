import { qitsOperation } from '@qits/angular';
import { listUserSubjects } from '../../api/idp';
import { IDP_REFUSAL, LIST_USER_SUBJECTS } from './user-subjects.consumes';

/**
 * `USER_SUBJECTS` (qits-2725): every account's subject and username, sorted by username, for the
 * Toggles rule editor's person picker; `user-subjects.operations.pact.spec.ts` binds it. qits:admin
 * or the delivery desk; any other caller is 403, and the editor then offers typing alone.
 */
export const USER_SUBJECTS = qitsOperation({
  provider: 'qits-idp-service',
  operationId: 'listUserSubjects',
  method: 'GET',
  call: listUserSubjects,
  consumes: LIST_USER_SUBJECTS,
  errorConsumes: IDP_REFUSAL,
});
