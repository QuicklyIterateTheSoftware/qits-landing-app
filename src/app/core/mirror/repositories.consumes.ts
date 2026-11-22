import type { ListRepositoriesResponses } from '../../api/mirror';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-mirror's cache roots (qits-2471): `REPOSITORY_LIST`
 * (`repositories.operations.ts`) declares it as `consumes`, so nothing else can be read, and its
 * pact spec binds the same list. To read another field, add it here.
 */

/** `REPOSITORY_LIST`: every cache root, for the Mirror section's Caches page. */
export const LIST_REPOSITORIES = [
  'repositories[].name',
  'repositories[].type',
  'repositories[].upstream',
  'repositories[].createdAt',
  'repositories[].evictionWindow',
] as const;

/** The cache roots envelope, cut to what the page reads. */
export type CacheRoots = Consumed<ListRepositoriesResponses[200], typeof LIST_REPOSITORIES>;

/** One cache root, cut to what the page reads. */
export type CacheRoot = NonNullable<CacheRoots['repositories']>[number];
