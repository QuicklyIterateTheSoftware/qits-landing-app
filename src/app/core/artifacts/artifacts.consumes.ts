import type { Consumed } from '@qits/angular';
import type {
  ListDaemonVersionsResponses,
  ListDocsVersionSummariesResponses,
  ListImageManifestSummariesResponses,
  ListImagesResponses,
  ListImageTagSummariesResponses,
  ListMavenVersionSummariesResponses,
  ListNpmVersionSummariesResponses,
  ListSbomVersionsResponses,
} from '../../api/artifacts';

/**
 * What the artifact pages read from qits-artifacts (qits-2316; the store's repository listings went
 * with their page, qits-2477): an image repository's images and one image's tags and manifests
 * (qits-2324); one maven coordinate's versions and SBOMs (qits-2325); one daemon's versions and a
 * version's bytes (qits-2327); one docs site's versions (qits-2328); and one npm package's versions
 * and SBOMs (qits-2326). `artifacts.operations.ts`
 * declares each read with these lists, so nothing can read
 * any other field, and `artifacts.operations.pact.spec.ts` binds the same. To read another field,
 * add it here.
 */

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
 * `ARTIFACT_NPM_VERSIONS` (`listNpmVersionSummaries`, qits-2326): one npm package's versions in
 * store order, each with its tarball's bytes (null when not measured), when it was published (null
 * when not recorded) and the dist-tags pointing at it.
 */
export const LIST_ARTIFACT_NPM_VERSIONS = [
  'versions[].version',
  'versions[].tarballSizeBytes',
  'versions[].publishedAt',
  'versions[].distTags',
] as const;

export type ArtifactNpmVersions = Consumed<
  ListNpmVersionSummariesResponses[200],
  typeof LIST_ARTIFACT_NPM_VERSIONS
>;
export type ArtifactNpmVersion = NonNullable<ArtifactNpmVersions['versions']>[number];

/**
 * `ARTIFACT_SBOM_VERSIONS` (`listSbomVersions`, qits-2325; the npm package page's too, qits-2326):
 * every stored SBOM of one package, newest first, each by its release version, with its CycloneDX
 * spec version, its bytes and when it was stored. A package with none answers 404, which is "no
 * SBOMs", not a failure.
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
 * `ARTIFACT_SBOM` (`getSbom`, qits-2325; the npm package page's too, qits-2326): one release's
 * CycloneDX document, read on a press to be saved as a file. It is read whole, as text, so the pact binds its media type, never a field.
 */
export const GET_ARTIFACT_SBOM = [] as const;

/**
 * `ARTIFACT_DAEMON_VERSIONS` (`listDaemonVersions`, qits-2327): one daemon's published versions,
 * newest first as the wire gives them, each with its digest, its own blob's bytes, when it was
 * published and when its version-addressed download last answered (`null`: never).
 */
export const LIST_ARTIFACT_DAEMON_VERSIONS = [
  'versions[].version',
  'versions[].digest',
  'versions[].sizeBytes',
  'versions[].publishedAt',
  'versions[].accessedAt',
] as const;

export type ArtifactDaemonVersions = Consumed<
  ListDaemonVersionsResponses[200],
  typeof LIST_ARTIFACT_DAEMON_VERSIONS
>;
export type ArtifactDaemonVersion = NonNullable<ArtifactDaemonVersions['versions']>[number];

/**
 * `ARTIFACT_DAEMON_DOWNLOAD` (`getDaemon`, qits-2327): one daemon version's bytes. The answer is no
 * JSON: it is read whole, as a Blob, and saved as a file, so the pact binds its status only.
 */
export const GET_ARTIFACT_DAEMON = [] as const;

/**
 * `ARTIFACT_DOCS_VERSIONS` (`listDocsVersionSummaries`, qits-2328): one docs site's versions,
 * newest first as the wire gives them, each with its file count, its size (the union of the
 * version's own blobs), when it was published, when it was last read (`null`: never) and its
 * metadata, a map of free keys (`git.repository.name`, `git.commit.hash`, …), bound whole.
 */
export const LIST_ARTIFACT_DOCS_VERSIONS = [
  'versions[].version',
  'versions[].fileCount',
  'versions[].sizeBytes',
  'versions[].publishedAt',
  'versions[].accessedAt',
  'versions[].metadata',
] as const;

export type ArtifactDocsVersions = Consumed<
  ListDocsVersionSummariesResponses[200],
  typeof LIST_ARTIFACT_DOCS_VERSIONS
>;
export type ArtifactDocsVersion = NonNullable<ArtifactDocsVersions['versions']>[number];
