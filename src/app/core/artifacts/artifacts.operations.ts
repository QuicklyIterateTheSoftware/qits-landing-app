import { qitsOperation } from '@qits/angular';
import {
  listArtifactRecords,
  listDaemons,
  listDocsSiteSummaries,
  listImages,
  listMavenPackages,
  listNpmPackages,
  listRepositories,
} from '../../api/artifacts';
import {
  LIST_ARTIFACT_DAEMONS,
  LIST_ARTIFACT_DOCS_SITES,
  LIST_ARTIFACT_IMAGES,
  LIST_ARTIFACT_MAVEN_PACKAGES,
  LIST_ARTIFACT_NPM_PACKAGES,
  LIST_ARTIFACT_RECORDS,
  LIST_ARTIFACT_REPOSITORIES,
} from './artifacts.consumes';

/**
 * qits-artifacts' store explorer reads declared as operations (qits-2316), for the Artifacts
 * section's store repository page (`ArtifactsRepositoryPage`), which reads them through
 * `qitsResource`: the store's repositories, then exactly one listing, chosen by the repository's
 * type (`listingOf`, `artifact-listings.ts`). `artifacts.operations.pact.spec.ts` binds each with
 * the same provider, operationId and `consumes`.
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

/** A `docs` repository's sites (`listDocsSiteSummaries`). */
export const ARTIFACT_DOCS_SITES = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDocsSiteSummaries',
  method: 'GET',
  call: listDocsSiteSummaries,
  consumes: LIST_ARTIFACT_DOCS_SITES,
});

/** A `ci-screenshots` or `ci-videos` repository's records, unfiltered (`listArtifactRecords`). */
export const ARTIFACT_RECORDS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listArtifactRecords',
  method: 'GET',
  call: listArtifactRecords,
  consumes: LIST_ARTIFACT_RECORDS,
});
