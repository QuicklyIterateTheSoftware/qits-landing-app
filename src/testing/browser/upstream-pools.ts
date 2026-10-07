import { recorded } from '@qits/angular/testing/browser';
import type { UpstreamPool } from '$patterns/maintenance/bumps-menu/bumps-menu';

/**
 * A fixture for the edge's `/upstream-pools` (qits-1065), registered as a recording the way a
 * provider's `goldenMaster(...)` is. The edge serves this endpoint itself, and this app pins no
 * edge document with a pact — neither `/main-navigation` nor this one — so there is no
 * golden-master package to read a body out of. A browser spec's `flush(...)` still needs a
 * recording to answer a 2xx with (`guardGoldenMasters`/`qits/browser-spec-data-from-golden-masters`),
 * so this is the one place that registers the hand-written body: a spec takes `pools` from here
 * rather than wrapping `recorded(...)` itself.
 */
export function upstreamPoolsGoldenMaster(pools: readonly UpstreamPool[]): readonly UpstreamPool[] {
  return recorded(pools);
}
