import type { GetUpstreamPoolsResponses } from '../../api/edge';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from the edge's own documents (qits-2220): `UPSTREAM_POOLS`
 * (`edge.operations.ts`) declares it as `consumes`, so nothing else can be read, and its pact spec
 * binds the same list. To read another field, add it here.
 */

/**
 * `UPSTREAM_POOLS`: the edge's upstream connection pools, one entry per pool and origin holding an
 * open connection, fullest first, for the bumps menu's pools section. Each row shows the owner's
 * name, the pool when it is the stream pool, and how full it is (`open`/`max`).
 */
export const GET_UPSTREAM_POOLS = ['[].name', '[].origin', '[].pool', '[].open', '[].max'] as const;

/** One pool, cut to what the menu reads. */
export type UpstreamPoolEntry = Consumed<
  GetUpstreamPoolsResponses[200],
  typeof GET_UPSTREAM_POOLS
>[number];
