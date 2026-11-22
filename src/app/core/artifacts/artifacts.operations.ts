import { qitsOperation } from '@qits/angular';
import {
  getDaemon,
  getSbom,
  listDaemonVersions,
  listDocsVersionSummaries,
  listImageManifestSummaries,
  listImages,
  listImageTagSummaries,
  listMavenVersionSummaries,
  listNpmVersionSummaries,
  listSbomVersions,
} from '../../api/artifacts';
import {
  GET_ARTIFACT_DAEMON,
  GET_ARTIFACT_SBOM,
  LIST_ARTIFACT_DAEMON_VERSIONS,
  LIST_ARTIFACT_DOCS_VERSIONS,
  LIST_ARTIFACT_IMAGE_MANIFESTS,
  LIST_ARTIFACT_IMAGE_TAGS,
  LIST_ARTIFACT_IMAGES,
  LIST_ARTIFACT_MAVEN_VERSIONS,
  LIST_ARTIFACT_NPM_VERSIONS,
  LIST_ARTIFACT_SBOM_VERSIONS,
} from './artifacts.consumes';

/**
 * qits-artifacts' reads for the artifact pages, below the repository that publishes the artifact
 * (qits-2316; the store repository page and its listings are gone, qits-2477): the image page's
 * (`ArtifactsImagePage`,
 * qits-2324), which reads `ARTIFACT_IMAGES` for its headline row and one image's tags and
 * manifests; the maven package page's (`ArtifactsMavenPackagePage`, qits-2325), which reads one
 * coordinate's versions and its SBOMs, and one SBOM on a press; the daemon page's
 * (`ArtifactsDaemonPage`, qits-2327): one daemon's versions, and a version's bytes on a press; the
 * docs site page's (`ArtifactsDocsSitePage`, qits-2328): one docs site's versions; and the npm
 * package page's (`ArtifactsNpmPackagePage`, qits-2326), which reads one package's versions and
 * its SBOMs, and one SBOM on a press (the SBOM operations the maven package page's).
 * `artifacts.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`.
 */

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

/**
 * One docs site's versions (`listDocsVersionSummaries`, qits-2328), newest first: 404 for an
 * unknown repository, 400 for one that holds no docs, an empty list for a site it does not hold.
 * The site is one path segment (`@changelog/qits-qits` is sent as `%40changelog%2Fqits-qits`); this
 * `/artifacts/api/` door takes it encoded, as every artifacts door does.
 */
export const ARTIFACT_DOCS_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDocsVersionSummaries',
  method: 'GET',
  call: listDocsVersionSummaries,
  consumes: LIST_ARTIFACT_DOCS_VERSIONS,
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
 * One npm package's versions (`listNpmVersionSummaries`, qits-2326), in store order: 404 for an
 * unknown repository, 400 for one that holds no npm packages, an empty list for a package it does
 * not hold. The name is one path segment (`@qits/angular` is sent as `%40qits%2Fangular`); this
 * `/artifacts/api/` door takes it encoded.
 */
export const ARTIFACT_NPM_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listNpmVersionSummaries',
  method: 'GET',
  call: listNpmVersionSummaries,
  consumes: LIST_ARTIFACT_NPM_VERSIONS,
});

/**
 * One package's stored SBOMs (`listSbomVersions`, qits-2325), newest first, for any package type
 * (`maven`, the maven package page; `npm`, the npm package page, qits-2326): 404 when it has none.
 * `packageName` is one path segment, sent as the generated client encodes it
 * (`eu.wohlben.qits%3Aqits-eventstream`, `%40qits%2Fangular`), which the store reads (qits-2409).
 */
export const ARTIFACT_SBOM_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listSbomVersions',
  method: 'GET',
  call: listSbomVersions,
  consumes: LIST_ARTIFACT_SBOM_VERSIONS,
});

/**
 * One release's CycloneDX document (`getSbom`, qits-2325; npm's too, qits-2326), read on a press
 * and saved as a file (`sbom-download.ts`); 404 when none is stored. Its `packageName` goes out
 * encoded, as the list's.
 */
export const ARTIFACT_SBOM = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'getSbom',
  method: 'GET',
  call: getSbom,
  consumes: GET_ARTIFACT_SBOM,
});
