import { qitsOperation } from '@qits/angular';
import { getUpstreamPools } from '../../api/edge';
import { GET_UPSTREAM_POOLS } from './edge.consumes';

/**
 * The edge's own documents declared as operations (qits-2220): the upstream pools for the top bar's
 * bumps menu, which reads them through `qitsResource`; `edge.operations.pact.spec.ts` binds it with
 * the same provider, operationId and `consumes`. The edge answers it on every host, so the client
 * keeps its empty `baseUrl` (`app.config.ts`): the call goes to the page's own origin.
 */

/** The edge's upstream connection pools (`getUpstreamPools`), the bumps menu's pools section. */
export const UPSTREAM_POOLS = qitsOperation({
  provider: 'qits-edge-service',
  operationId: 'getUpstreamPools',
  method: 'GET',
  call: getUpstreamPools,
  consumes: GET_UPSTREAM_POOLS,
});
