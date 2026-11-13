import { qitsOperation } from '@qits/angular';
import {
  getCommitFileDiff,
  getReleaseRequestChangeDiff,
  getReleaseRequestSubmoduleChangeDiff,
  getReleaseRequestSubmoduleChanges,
  listCommitChanges,
  listReleaseRequestChanges,
} from '../../api/projects';
import {
  GET_FILE_DIFF,
  GET_SUBMODULE_CHANGES,
  LIST_COMMIT_CHANGES,
  LIST_RELEASE_REQUEST_CHANGES,
} from './changes.consumes';

/**
 * qits-projects' change reads declared as operations (qits-2145): what a release request's fold
 * changes and what one commit changes, read by the Changes tab (`app-release-changes`) and a
 * commit's changeset (`app-commit-changes`) through their own `qitsResource`s (qits-2146;
 * `ChangesStore` read them before). `changes.operations.pact.spec.ts` binds each with the same
 * provider, operationId and `consumes`. Each answer is a fact about a fold or a commit, so no event
 * reads one again: a re-fold is a new fold, so new params.
 */

/** The files the fold changes against the newest release tag not holding it. */
export const RELEASE_CHANGES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listReleaseRequestChanges',
  method: 'GET',
  call: listReleaseRequestChanges,
  consumes: LIST_RELEASE_REQUEST_CHANGES,
});

/** One file's patch in the fold (`?path=`). */
export const RELEASE_FILE_DIFF = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getReleaseRequestChangeDiff',
  method: 'GET',
  call: getReleaseRequestChangeDiff,
  consumes: GET_FILE_DIFF,
});

/** A submodule pin the fold moves: the two pins and the sibling's commits between them. */
export const SUBMODULE_CHANGES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getReleaseRequestSubmoduleChanges',
  method: 'GET',
  call: getReleaseRequestSubmoduleChanges,
  consumes: GET_SUBMODULE_CHANGES,
});

/** One file's patch inside a moved pin, in the sibling. */
export const SUBMODULE_FILE_DIFF = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getReleaseRequestSubmoduleChangeDiff',
  method: 'GET',
  call: getReleaseRequestSubmoduleChangeDiff,
  consumes: GET_FILE_DIFF,
});

/** The files one commit changes against its first parent. */
export const COMMIT_CHANGES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listCommitChanges',
  method: 'GET',
  call: listCommitChanges,
  consumes: LIST_COMMIT_CHANGES,
});

/** One file's patch in one commit. */
export const COMMIT_FILE_DIFF = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getCommitFileDiff',
  method: 'GET',
  call: getCommitFileDiff,
  consumes: GET_FILE_DIFF,
});
