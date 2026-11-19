import type { Consumed } from '@qits/angular';
import type {
  ListArtifactRecordsResponses,
  ListDaemonsResponses,
  ListDocsSiteSummariesResponses,
  ListImagesResponses,
  ListMavenPackagesResponses,
  ListNpmPackagesResponses,
  ListRepositoriesResponses,
} from '../../api/artifacts';

/**
 * What the app reads from qits-artifacts' store explorer doors (qits-2316): the store's
 * repositories, and one repository's listing by its type. `artifacts.operations.ts` declares each
 * read with these lists, so nothing can read any other field, and
 * `artifacts.operations.pact.spec.ts` binds the same. To read another field, add it here.
 */

/**
 * `ARTIFACT_REPOSITORIES` (`listRepositories`): every store repository, its type (which listing it
 * has), and how much it holds (`itemCount` counts what its type counts, `sizeBytes` the union of
 * its blobs). The page's header and its store switcher.
 */
export const LIST_ARTIFACT_REPOSITORIES = [
  'repositories[].name',
  'repositories[].type',
  'repositories[].itemCount',
  'repositories[].sizeBytes',
] as const;

/** The repositories' answer, cut to what the page reads. */
export type ArtifactRepositories = Consumed<
  ListRepositoriesResponses[200],
  typeof LIST_ARTIFACT_REPOSITORIES
>;

/** One store repository, cut to what the page reads. */
export type ArtifactRepository = NonNullable<ArtifactRepositories['repositories']>[number];

/** `ARTIFACT_IMAGES` (`listImages`): an image repository's images, each with its counts and size. */
export const LIST_ARTIFACT_IMAGES = [
  'images[].name',
  'images[].tagCount',
  'images[].manifestCount',
  'images[].sizeBytes',
] as const;

export type ArtifactImages = Consumed<ListImagesResponses[200], typeof LIST_ARTIFACT_IMAGES>;
export type ArtifactImage = NonNullable<ArtifactImages['images']>[number];

/** `ARTIFACT_NPM_PACKAGES` (`listNpmPackages`): an npm repository's packages. */
export const LIST_ARTIFACT_NPM_PACKAGES = [
  'packages[].name',
  'packages[].versionCount',
  'packages[].latest',
] as const;

export type ArtifactNpmPackages = Consumed<
  ListNpmPackagesResponses[200],
  typeof LIST_ARTIFACT_NPM_PACKAGES
>;
export type ArtifactNpmPackage = NonNullable<ArtifactNpmPackages['packages']>[number];

/** `ARTIFACT_MAVEN_PACKAGES` (`listMavenPackages`): a maven repository's coordinates. */
export const LIST_ARTIFACT_MAVEN_PACKAGES = [
  'packages[].name',
  'packages[].versionCount',
  'packages[].sizeBytes',
] as const;

export type ArtifactMavenPackages = Consumed<
  ListMavenPackagesResponses[200],
  typeof LIST_ARTIFACT_MAVEN_PACKAGES
>;
export type ArtifactMavenPackage = NonNullable<ArtifactMavenPackages['packages']>[number];

/** `ARTIFACT_DAEMONS` (`listDaemons`): a daemon repository's daemons, with their newest version. */
export const LIST_ARTIFACT_DAEMONS = [
  'daemons[].name',
  'daemons[].versionCount',
  'daemons[].latestVersion',
  'daemons[].latestPublishedAt',
  'daemons[].sizeBytes',
] as const;

export type ArtifactDaemons = Consumed<ListDaemonsResponses[200], typeof LIST_ARTIFACT_DAEMONS>;
export type ArtifactDaemon = NonNullable<ArtifactDaemons['daemons']>[number];

/** `ARTIFACT_DOCS_SITES` (`listDocsSiteSummaries`): a docs repository's sites. */
export const LIST_ARTIFACT_DOCS_SITES = [
  'sites[].name',
  'sites[].versionCount',
  'sites[].latestVersion',
  'sites[].latestPublishedAt',
  'sites[].sizeBytes',
] as const;

export type ArtifactDocsSites = Consumed<
  ListDocsSiteSummariesResponses[200],
  typeof LIST_ARTIFACT_DOCS_SITES
>;
export type ArtifactDocsSite = NonNullable<ArtifactDocsSites['sites']>[number];

/**
 * `ARTIFACT_RECORDS` (`listArtifactRecords`): a ci repository's records, unfiltered. `metadata` is
 * a map of free keys, so it is bound whole.
 */
export const LIST_ARTIFACT_RECORDS = [
  'records[].id',
  'records[].mediatype',
  'records[].metadata',
  'records[].size',
  'records[].createdAt',
  'records[].accessedAt',
] as const;

export type ArtifactRecords = Consumed<
  ListArtifactRecordsResponses[200],
  typeof LIST_ARTIFACT_RECORDS
>;
export type ArtifactRecord = NonNullable<ArtifactRecords['records']>[number];
