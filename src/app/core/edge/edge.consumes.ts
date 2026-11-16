import type { GetMainNavigationResponses, GetUpstreamPoolsResponses } from '../../api/edge';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from the edge's own documents (qits-2220): `UPSTREAM_POOLS` and
 * `MAIN_NAVIGATION` (`edge.operations.ts`) declare it as `consumes`, so nothing else can be read,
 * and their pact spec binds the same lists. To read another field, add it here.
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

/**
 * `MAIN_NAVIGATION`: which platform apps sit on the private network (qits-2297). `PrivateApps`
 * reads each application's `origin` and `exposure` (`'private'` on an app only the tunnel
 * reaches). `applications` is a map keyed by application name, and a consumed path has no step for
 * "every key of a map" (only `[]`, every element of an array), so it is read whole: the pact binds
 * every recorded application's entry, `apiDocs` included, although only `origin` and `exposure`
 * are read.
 */
export const GET_MAIN_NAVIGATION = ['applications'] as const;

/** The navigation's applications, cut to what `PrivateApps` reads. */
export type NavigationApplications = Consumed<
  GetMainNavigationResponses[200],
  typeof GET_MAIN_NAVIGATION
>['applications'];
