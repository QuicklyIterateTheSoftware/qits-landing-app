import type { ListRepositoryPackagesResponses } from '../../api/mirror';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of one qits-mirror cache root's contents (qits-2358): `REPOSITORY_PACKAGES`
 * (`repository-packages.operations.ts`) declares it as `consumes`, so nothing else can be read, and
 * its pact spec binds the same list. To read another field, add it here.
 */

/**
 * `REPOSITORY_PACKAGES`: the cache root (its type, upstream and eviction window) and what it holds,
 * package by package and version by version, for the Mirror section's repository page.
 */
export const LIST_REPOSITORY_PACKAGES = [
  'repository.name',
  'repository.type',
  'repository.upstream',
  'repository.evictionWindow',
  'packages[].name',
  'packages[].sizeBytes',
  'packages[].lastAccessedAt',
  'packages[].versions[].version',
  'packages[].versions[].labels',
  'packages[].versions[].files',
  'packages[].versions[].sizeBytes',
  'packages[].versions[].cachedAt',
  'packages[].versions[].lastAccessedAt',
] as const;

/** The packages envelope, cut to what the page reads. */
export type RepositoryPackages = Consumed<
  ListRepositoryPackagesResponses[200],
  typeof LIST_REPOSITORY_PACKAGES
>;

/** The cache root itself, cut to what the page reads. */
export type MirrorRepository = NonNullable<RepositoryPackages['repository']>;

/** One cached package (an npm package, a `group:artifact`, an OCI image), cut to what the page reads. */
export type CachedPackage = NonNullable<RepositoryPackages['packages']>[number];

/** One cached version of a package (for OCI a digest), cut to what the page reads. */
export type CachedVersion = NonNullable<CachedPackage['versions']>[number];
