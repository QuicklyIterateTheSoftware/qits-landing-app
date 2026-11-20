import type { ListUpstreamsResponses } from '../../api/mirror';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-mirror's OCI upstreams (qits-2357): `UPSTREAM_LIST`
 * (`upstreams.operations.ts`) declares it as `consumes`, so nothing else can be read, and its pact
 * spec binds the same list. To read another field, add it here.
 */

/** `UPSTREAM_LIST`: the image registries the mirror fronts, for the Mirror section's upstreams page. */
export const LIST_UPSTREAMS = [
  'upstreams[].host',
  'upstreams[].namespace',
  'upstreams[].cachedImages',
  'upstreams[].createdAt',
] as const;

/** The upstreams envelope, cut to what the page reads. */
export type Upstreams = Consumed<ListUpstreamsResponses[200], typeof LIST_UPSTREAMS>;

/** One OCI upstream, cut to what the page reads. */
export type OciUpstream = NonNullable<Upstreams['upstreams']>[number];
