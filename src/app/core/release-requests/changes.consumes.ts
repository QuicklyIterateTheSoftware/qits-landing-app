import type {
  GetProjectsApiRepositoriesByRepoIdCommitsByCommitHashChangesResponses,
  GetProjectsApiRepositoriesByRepoIdCommitsByCommitHashDiffResponses,
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdChangesResponses,
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdChangesSubmoduleResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `ChangesStore` reads from qits-projects' answers about changed files: a release request's
 * fold, a submodule pin it moves, and a single commit. The store passes these lists to
 * `consume(...)`, and its pact spec binds exactly them.
 */

/** A changed file, as every file list reads it. */
const FILE = ['path', 'oldPath', 'changeType'] as const;

/** A changed file that may be a submodule pin. */
const FILE_WITH_PIN = [
  ...FILE,
  'submodule.repositoryId',
  'submodule.name',
  'submodule.oldSha',
  'submodule.newSha',
  'submodule.detail',
] as const;

const files = <const T extends readonly string[]>(paths: T) =>
  paths.map((path) => `files[].${path}`) as { [K in keyof T]: `files[].${T[K] & string}` };

/** The files a request's fold changes, against the newest release tag not holding it. */
export const LIST_RELEASE_REQUEST_CHANGES = [
  'mergedSha',
  'baseTag',
  ...files(FILE_WITH_PIN),
  'truncated',
  'detail',
] as const;

/** One file's patch: the fold's, a submodule's, or a commit's. */
export const GET_FILE_DIFF = ['path', 'changeType', 'diff'] as const;

/** A submodule pin the fold moves: the sibling's commits and changed files between the pins. */
export const GET_SUBMODULE_CHANGES = [
  'name',
  'oldSha',
  'newSha',
  'commits[].hash',
  'commits[].shortHash',
  'commits[].author',
  'commits[].date',
  'commits[].message',
  ...files(FILE),
  'truncated',
  'detail',
] as const;

/** The files one commit changes, against its first parent. */
export const LIST_COMMIT_CHANGES = ['commit', 'parent', ...files(FILE_WITH_PIN)] as const;

/** The fold's changes. */
export type ReleaseChanges = Consumed<
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdChangesResponses[200],
  typeof LIST_RELEASE_REQUEST_CHANGES
>;

/** One changed file, possibly a submodule pin. */
export type ChangedFile = NonNullable<ReleaseChanges['files']>[number];

/** A file's patch. */
export type FileDiff = Consumed<
  GetProjectsApiRepositoriesByRepoIdCommitsByCommitHashDiffResponses[200],
  typeof GET_FILE_DIFF
>;

/** A submodule pin move, expanded. */
export type SubmoduleChanges = Consumed<
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdChangesSubmoduleResponses[200],
  typeof GET_SUBMODULE_CHANGES
>;

/** A commit's changes. */
export type CommitChanges = Consumed<
  GetProjectsApiRepositoriesByRepoIdCommitsByCommitHashChangesResponses[200],
  typeof LIST_COMMIT_CHANGES
>;
