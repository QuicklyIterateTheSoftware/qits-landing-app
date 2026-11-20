import type { Consumed } from '@qits/angular';
import type {
  ListArtifactRecordsResponses,
  ListDaemonsResponses,
  ListDocsSiteSummariesResponses,
  ListImageManifestSummariesResponses,
  ListImagesResponses,
  ListImageTagSummariesResponses,
  ListMavenPackagesResponses,
  ListMavenVersionSummariesResponses,
  ListNpmPackagesResponses,
  ListRepositoriesResponses,
  ListSbomVersionsResponses,
} from '../../api/artifacts';

/**
 * What the app reads from qits-artifacts' store explorer doors (qits-2316): the store's
 * repositories, and one repository's listing by its type; one image's tags and manifests
 * (qits-2324); and one maven coordinate's versions and SBOMs (qits-2325). `artifacts.operations.ts` declares each read with these lists, so nothing can read
 * any other field, and `artifacts.operations.pact.spec.ts` binds the same. To read another field,
 * add it here.
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

/**
 * `ARTIFACT_IMAGE_TAGS` (`listImageTagSummaries`, qits-2324): one image's tags, each with the
 * manifest it names and the bytes that manifest references (not additive across tags: builds share
 * layers), when it was pushed and last pulled (`null`: never).
 */
export const LIST_ARTIFACT_IMAGE_TAGS = [
  'tags[].tag',
  'tags[].digest',
  'tags[].sizeBytes',
  'tags[].createdAt',
  'tags[].accessedAt',
] as const;

export type ArtifactImageTags = Consumed<
  ListImageTagSummariesResponses[200],
  typeof LIST_ARTIFACT_IMAGE_TAGS
>;
export type ArtifactImageTag = NonNullable<ArtifactImageTags['tags']>[number];

/**
 * `ARTIFACT_IMAGE_MANIFESTS` (`listImageManifestSummaries`, qits-2324): one image's manifests,
 * each with the tags naming it (none: untagged), its media type, referenced bytes, when it was
 * created and last pulled (`null`: never).
 */
export const LIST_ARTIFACT_IMAGE_MANIFESTS = [
  'manifests[].digest',
  'manifests[].mediaType',
  'manifests[].sizeBytes',
  'manifests[].createdAt',
  'manifests[].accessedAt',
  'manifests[].tags',
] as const;

export type ArtifactImageManifests = Consumed<
  ListImageManifestSummariesResponses[200],
  typeof LIST_ARTIFACT_IMAGE_MANIFESTS
>;
export type ArtifactImageManifest = NonNullable<ArtifactImageManifests['manifests']>[number];

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

/**
 * `ARTIFACT_MAVEN_VERSIONS` (`listMavenVersionSummaries`, qits-2325): one coordinate's versions in
 * store order, each with its deployed file names (in either order), their bytes and when the
 * version was published.
 */
export const LIST_ARTIFACT_MAVEN_VERSIONS = [
  'versions[].version',
  'versions[].files',
  'versions[].sizeBytes',
  'versions[].publishedAt',
] as const;

export type ArtifactMavenVersions = Consumed<
  ListMavenVersionSummariesResponses[200],
  typeof LIST_ARTIFACT_MAVEN_VERSIONS
>;
export type ArtifactMavenVersion = NonNullable<ArtifactMavenVersions['versions']>[number];

/**
 * `ARTIFACT_SBOM_VERSIONS` (`listSbomVersions`, qits-2325): every stored SBOM of one package,
 * newest first, each by its release version, with its CycloneDX spec version, its bytes and when
 * it was stored. A package with none answers 404, which is "no SBOMs", not a failure.
 */
export const LIST_ARTIFACT_SBOM_VERSIONS = [
  'versions[].version',
  'versions[].specVersion',
  'versions[].sizeBytes',
  'versions[].createdAt',
] as const;

export type ArtifactSbomVersions = Consumed<
  ListSbomVersionsResponses[200],
  typeof LIST_ARTIFACT_SBOM_VERSIONS
>;
export type ArtifactSbomVersion = NonNullable<ArtifactSbomVersions['versions']>[number];

/**
 * `ARTIFACT_SBOM` (`getSbom`, qits-2325): one release's CycloneDX document, read on a press to be
 * saved as a file. It is read whole, as text, so the pact binds its media type, never a field.
 */
export const GET_ARTIFACT_SBOM = [] as const;

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
