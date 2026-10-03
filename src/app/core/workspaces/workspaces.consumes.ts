import type {
  ListOpenWorkspacesResponses,
  ListWorkItemWorkspacesResponses,
} from '../../api/workspaces';
import type { Consumed } from '@qits/angular';

/**
 * What `WorkspacesStore` reads from qits-workspaces' answers (epic qits-112). The store passes
 * each list to `consume(...)`, so it cannot read any other field, and its pact spec passes the same
 * lists as `consumes`. To read another field, add it here.
 */

/**
 * `WorkspacesStore.load()`: the platform's ACTIVE workspaces that are bound to a work item. The
 * cards read only which items have one: the item's id (`workId`, qits-projects' entity id).
 */
export const LIST_OPEN_WORKSPACES = ['entries[].workspace.workId'] as const;

/** One open workspace, cut to what the store reads. */
export type OpenWorkspace = NonNullable<
  NonNullable<
    Consumed<ListOpenWorkspacesResponses[200], typeof LIST_OPEN_WORKSPACES>['entries']
  >[number]['workspace']
>;

/**
 * `WorkspacesStore.loadHistory(workRef)`: one work item's workspaces in every state, newest
 * first. The work item page shows each one's state, branch, and when it was opened and closed.
 */
export const LIST_WORK_ITEM_WORKSPACES = [
  'entries[].workspace.id',
  'entries[].workspace.branch',
  'entries[].workspace.status',
  'entries[].workspace.createdAt',
  'entries[].workspace.resolvedAt',
] as const;

/** One workspace of an item's history, cut to what the store reads. */
export type WorkspaceHistoryEntry = NonNullable<
  NonNullable<
    Consumed<ListWorkItemWorkspacesResponses[200], typeof LIST_WORK_ITEM_WORKSPACES>['entries']
  >[number]['workspace']
>;
