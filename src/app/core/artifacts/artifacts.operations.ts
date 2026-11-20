import { qitsOperation } from '@qits/angular';
import {
  getDaemon,
  getSbom,
  listArtifactRecords,
  listDaemons,
  listDaemonVersions,
  listDocsSiteSummaries,
  listDocsVersionSummaries,
  listImageManifestSummaries,
  listImages,
  listImageTagSummaries,
  listMavenPackages,
  listMavenVersionSummaries,
  listNpmPackages,
  listRepositories,
  listSbomVersions,
} from '../../api/artifacts';
import {
  GET_ARTIFACT_DAEMON,
  GET_ARTIFACT_SBOM,
  LIST_ARTIFACT_DAEMON_VERSIONS,
  LIST_ARTIFACT_DAEMONS,
  LIST_ARTIFACT_DOCS_SITES,
  LIST_ARTIFACT_DOCS_VERSIONS,
  LIST_ARTIFACT_IMAGE_MANIFESTS,
  LIST_ARTIFACT_IMAGE_TAGS,
  LIST_ARTIFACT_IMAGES,
  LIST_ARTIFACT_MAVEN_PACKAGES,
  LIST_ARTIFACT_MAVEN_VERSIONS,
  LIST_ARTIFACT_NPM_PACKAGES,
  LIST_ARTIFACT_RECORDS,
  LIST_ARTIFACT_REPOSITORIES,
  LIST_ARTIFACT_SBOM_VERSIONS,
} from './artifacts.consumes';

/**
 * qits-artifacts' store explorer reads declared as operations (qits-2316), for the Artifacts
 * section's store repository page (`ArtifactsRepositoryPage`), which reads them through
 * `qitsResource`: the store's repositories, then exactly one listing, chosen by the repository's
 * type (`listingOf`, `artifact-listings.ts`); and the image page's (`ArtifactsImagePage`,
 * qits-2324), which reads `ARTIFACT_IMAGES` for its headline row and one image's tags and
 * manifests; the maven package page's (`ArtifactsMavenPackagePage`, qits-2325), which reads one
 * coordinate's versions and its SBOMs, and one SBOM on a press; the daemon page's
 * (`ArtifactsDaemonPage`, qits-2327): one daemon's versions, and a version's bytes on a press; and
 * the docs site page's (`ArtifactsDocsSitePage`, qits-2328): one docs site's versions.
 * `artifacts.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`.
 */

/** Every store repository with its type, count and size (`listRepositories`). */
export const ARTIFACT_REPOSITORIES = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listRepositories',
  method: 'GET',
  call: listRepositories,
  consumes: LIST_ARTIFACT_REPOSITORIES,
});

/** An `oci-images` repository's images (`listImages`). */
export const ARTIFACT_IMAGES = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listImages',
  method: 'GET',
  call: listImages,
  consumes: LIST_ARTIFACT_IMAGES,
});

/**
 * One image's tags (`listImageTagSummaries`, qits-2324): 404 for an unknown repository, 400 for one
 * that holds no images, an empty list for an image it does not hold.
 */
export const ARTIFACT_IMAGE_TAGS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listImageTagSummaries',
  method: 'GET',
  call: listImageTagSummaries,
  consumes: LIST_ARTIFACT_IMAGE_TAGS,
});

/** One image's manifests (`listImageManifestSummaries`, qits-2324), answering as the tags do. */
export const ARTIFACT_IMAGE_MANIFESTS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listImageManifestSummaries',
  method: 'GET',
  call: listImageManifestSummaries,
  consumes: LIST_ARTIFACT_IMAGE_MANIFESTS,
});

/** An `npm-packages` repository's packages (`listNpmPackages`). */
export const ARTIFACT_NPM_PACKAGES = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listNpmPackages',
  method: 'GET',
  call: listNpmPackages,
  consumes: LIST_ARTIFACT_NPM_PACKAGES,
});

/** A `maven-packages` repository's coordinates (`listMavenPackages`). */
export const ARTIFACT_MAVEN_PACKAGES = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listMavenPackages',
  method: 'GET',
  call: listMavenPackages,
  consumes: LIST_ARTIFACT_MAVEN_PACKAGES,
});

/** A `daemon-binaries` repository's daemons (`listDaemons`, qits-1149). */
export const ARTIFACT_DAEMONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDaemons',
  method: 'GET',
  call: listDaemons,
  consumes: LIST_ARTIFACT_DAEMONS,
});

/**
 * One daemon's versions (`listDaemonVersions`, qits-2327), newest first: 404 for an unknown
 * repository, 400 for one that holds no daemons, an empty list for a daemon it does not hold.
 */
export const ARTIFACT_DAEMON_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDaemonVersions',
  method: 'GET',
  call: listDaemonVersions,
  consumes: LIST_ARTIFACT_DAEMON_VERSIONS,
});

/**
 * One daemon version's bytes (`getDaemon`, qits-2327): the version-addressed download a bootstrap
 * makes, on the daemon wire, which carries no repository segment. The daemon page reads it on a
 * press (`fetch`, through `HttpClient`, so the bearer signs it) as a Blob (`daemonDownloadParams`)
 * and saves it; a navigation would carry no bearer.
 */
export const ARTIFACT_DAEMON_DOWNLOAD = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'getDaemon',
  method: 'GET',
  call: getDaemon,
  consumes: GET_ARTIFACT_DAEMON,
});

/**
 * The params of a download of `daemon` at `version`, its body a Blob. The generated options do not
 * name `responseType`, but the client hands every option to the request's init, which reads it.
 */
export const daemonDownloadParams = (daemon: string, version: string) => ({
  path: { daemon, version },
  responseType: 'blob' as const,
});

/** A `docs` repository's sites (`listDocsSiteSummaries`). */
export const ARTIFACT_DOCS_SITES = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDocsSiteSummaries',
  method: 'GET',
  call: listDocsSiteSummaries,
  consumes: LIST_ARTIFACT_DOCS_SITES,
});

/**
 * One docs site's versions (`listDocsVersionSummaries`, qits-2328), newest first: 404 for an
 * unknown repository, 400 for one that holds no docs, an empty list for a site it does not hold.
 * The site is one path segment (`@changelog/qits-qits` is sent as `%40changelog%2Fqits-qits`); this
 * `/artifacts/api/` door takes it encoded, and `literalDocsPaths` leaves it so.
 */
export const ARTIFACT_DOCS_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDocsVersionSummaries',
  method: 'GET',
  call: listDocsVersionSummaries,
  consumes: LIST_ARTIFACT_DOCS_VERSIONS,
});

/** A `ci-screenshots` or `ci-videos` repository's records, unfiltered (`listArtifactRecords`). */
export const ARTIFACT_RECORDS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listArtifactRecords',
  method: 'GET',
  call: listArtifactRecords,
  consumes: LIST_ARTIFACT_RECORDS,
});

/**
 * One maven coordinate's versions (`listMavenVersionSummaries`, qits-2325), in store order: 404 for
 * an unknown repository, 400 for one that holds no maven packages, an empty list for a coordinate
 * it does not hold.
 */
export const ARTIFACT_MAVEN_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listMavenVersionSummaries',
  method: 'GET',
  call: listMavenVersionSummaries,
  consumes: LIST_ARTIFACT_MAVEN_VERSIONS,
});

/**
 * One package's stored SBOMs (`listSbomVersions`, qits-2325), newest first, for any package type
 * (`maven`, `npm`): 404 when it has none.
 */
export const ARTIFACT_SBOM_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listSbomVersions',
  method: 'GET',
  call: listSbomVersions,
  consumes: LIST_ARTIFACT_SBOM_VERSIONS,
});

/**
 * One release's CycloneDX document (`getSbom`, qits-2325), read on a press and saved as a file
 * (`sbom-download.ts`); 404 when none is stored.
 */
export const ARTIFACT_SBOM = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'getSbom',
  method: 'GET',
  call: getSbom,
  consumes: GET_ARTIFACT_SBOM,
});
