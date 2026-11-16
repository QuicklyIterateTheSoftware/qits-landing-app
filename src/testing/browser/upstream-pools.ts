import type { TestRequest } from '@angular/common/http/testing';

/**
 * The edge's `/upstream-pools` (`getUpstreamPools`, qits-2220) as the browser specs answer it:
 * the bumps menu reads it on the page's own origin, through `UPSTREAM_POOLS`. A spec showing pools
 * answers with `goldenMaster('an open upstream pool', 'getUpstreamPools', 'qits-edge')`.
 */
export const UPSTREAM_POOLS_PATH = '/upstream-pools';

/**
 * No pools below the bumps. The edge records no empty answer, and an empty array of the spec's own
 * would not be a recording, so the read is refused (401, the edge's answer to a caller it does
 * not admit): the section shows nothing either way.
 */
export const noPools = (request: TestRequest) =>
  request.flush(null, { status: 401, statusText: 'Unauthorized' });
