import { qitsOperation } from '@qits/angular';
import { getDocsFile, getDocsVersion, listDocsSites, listDocsVersions } from '../../api/artifacts';
import {
  GET_DOCS_FILE,
  GET_DOCS_VERSION,
  LIST_DOCS_SITES,
  LIST_DOCS_VERSIONS,
} from './docs.consumes';

/**
 * qits-artifacts' docs store reads declared as operations (qits-2145), for the services the UI
 * builder and a repository's contracts and entities pages read through instead of
 * `EntityMapStore`, `RoutesBundleStore`, `ContractsBundleStore` and `golden-masters.store.ts`
 * (qits-2146): `ContractsCatalog`, `RoutesBundles` and `ContractsBundles`.
 * `docs.operations.pact.spec.ts` binds each with the same provider, operationId and `consumes`.
 *
 * The site and the file path go on the wire as the store reads them (`/` and `@` literal) through
 * `literalDocsPaths` (`docs-paths.ts`), which `app.config.ts` puts on the artifacts client.
 */

/** Every docs site of a docs repository (`listDocsSites`). */
export const DOCS_SITES = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDocsSites',
  method: 'GET',
  call: listDocsSites,
  consumes: LIST_DOCS_SITES,
});

/** A site's versions, newest first, each with its metadata (`listDocsVersions`). */
export const DOCS_VERSIONS = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'listDocsVersions',
  method: 'GET',
  call: listDocsVersions,
  consumes: LIST_DOCS_VERSIONS,
});

/** A version's file paths (`getDocsVersion`). */
export const DOCS_VERSION = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'getDocsVersion',
  method: 'GET',
  call: getDocsVersion,
  consumes: GET_DOCS_VERSION,
});

/**
 * One file of a version, as published (`getDocsFile`): JSON by default, text or a blob when the
 * params ask for it (`responseType`).
 */
export const DOCS_FILE = qitsOperation({
  provider: 'qits-artifacts-service',
  operationId: 'getDocsFile',
  method: 'GET',
  call: getDocsFile,
  consumes: GET_DOCS_FILE,
});
