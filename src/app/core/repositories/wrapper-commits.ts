import { payloadField, type WithPayload } from '$core/events/refresh-on';

/**
 * What `movesWrapper` reads of a project's repositories: which one is the wrapper, and its main
 * branch. A read of `PROJECT_REPOSITORIES` or of `LIST_PROJECT_WRAPPER` holds it.
 */
export interface WrapperBranches {
  readonly entries?: readonly {
    readonly repository?: { readonly id?: string; readonly mainBranch?: string };
  }[];
  readonly wrapper?: { readonly repositoryId?: string };
}

/**
 * Whether `event` (a `SCMPublishCommit`) is a commit to the main branch of the wrapper
 * `repositories` names (`main` when its entry names none).
 *
 * Staleness (qits-1270): the wrapper's `.gitmodules` on main is what places a repository in the
 * tree (`wrapper.entries`, `declared`), and qits-projects commits there when it creates or adopts
 * one, so that commit is the one event that moves a project's list of repositories. Gaps:
 * qits-projects emits no repository-created, -renamed or -deleted event (a repository created
 * without a wrapper commit shows only on the next load), and none for a backup's outcome
 * (`lastBackup`) or a changed `mainBranch`/`backupUrl`.
 */
export function movesWrapper(
  event: WithPayload,
  repositories: WrapperBranches | undefined,
): boolean {
  const wrapperId = repositories?.wrapper?.repositoryId;
  if (!wrapperId || payloadField(event, 'repoId') !== wrapperId) return false;
  const wrapper = repositories.entries?.find((entry) => entry.repository?.id === wrapperId);
  return payloadField(event, 'branch') === (wrapper?.repository?.mainBranch || 'main');
}
