import { qitsOperation } from '@qits/angular';
import { listUpstreams } from '../../api/mirror';
import { LIST_UPSTREAMS } from './upstreams.consumes';

/**
 * qits-mirror's OCI upstreams (qits-2357) declared as operations, read by the Mirror section's
 * pages through their own `qitsResource`; `upstreams.operations.pact.spec.ts` binds them.
 *
 * `UPSTREAM_LIST`: the image registries the mirror fronts, `{ upstreams: [...] }` in namespace
 * order; `upstreams: []` when it fronts none (an operator deleted them), a 5xx when the database
 * cannot be read (never an empty list).
 */
export const UPSTREAM_LIST = qitsOperation({
  provider: 'qits-mirror-service',
  operationId: 'listUpstreams',
  method: 'GET',
  call: listUpstreams,
  consumes: LIST_UPSTREAMS,
});
