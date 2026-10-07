import { recorded } from '@qits/angular/testing/browser';
import type { UpstreamPool } from '$patterns/maintenance/bumps-menu/bumps-menu';

/**
 * A fixture for the edge's `/upstream-pools` (qits-1065), registered as a recording the way a
 * provider's `goldenMaster(...)` is. The edge is not a pact provider of this app — the ticket's
 * "Fix — edge" section says so explicitly ("No golden master needed: landing app does not pin edge
 * documents with pact") — so there is nothing to read out of a golden-master package. A browser
 * spec's `flush(...)` still needs a recording to answer a 2xx with
 * (`guardGoldenMasters`/`qits/browser-spec-data-from-golden-masters`), so this is the one place
 * that registers the hand-written body: a spec takes `pools` from here rather than wrapping
 * `recorded(...)` itself.
 */
export function upstreamPoolsGoldenMaster(pools: readonly UpstreamPool[]): readonly UpstreamPool[] {
  return recorded(pools);
}
