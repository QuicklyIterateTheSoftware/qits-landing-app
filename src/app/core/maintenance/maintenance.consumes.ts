import type {
  GetMaintenanceApiDependenciesResponses,
  GetMaintenanceApiRepositoriesResponses,
  ListPendingBumpsResponses,
} from '../../api/maintenance';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from qits-maintenance's answer (epic qits-112). The operation over it
 * (`PENDING_BUMPS_LIST`, `maintenance.operations.ts`) narrows the answer to this list, so nothing
 * can read any other field, and its pact spec passes the same list as `consumes`. To read another
 * field, add it here.
 */

/** How many pending bumps the bumps menu asks for: the newest, one page. */
export const PENDING_BUMPS = 20;

/**
 * `PENDING_BUMPS_LIST`: the newest bumps still on their way, of every repository, for the top
 * bar's bumps menu. Each row shows the repository, what moves (each change's dependency, ecosystem
 * and versions), the bump's mode, and how it stands: its run, or once green, its release.
 */
export const LIST_PENDING_BUMPS = [
  'bumps[].id',
  'bumps[].repository',
  'bumps[].mode',
  'bumps[].status',
  'bumps[].releaseState',
  'bumps[].changes[].ecosystem',
  'bumps[].changes[].name',
  'bumps[].changes[].from',
  'bumps[].changes[].to',
] as const;

/** One pending bump, cut to what the menu reads. */
export type BumpEntry = NonNullable<
  Consumed<ListPendingBumpsResponses[200], typeof LIST_PENDING_BUMPS>['bumps']
>[number];

/**
 * `MAINTENANCE_REPOSITORIES` (qits-2317): every repository of the inventory, read by the
 * Maintenance section's Dependencies page for its project only: the doors take no project, so the
 * page keeps the pins of the repositories whose `project` is the open one's id.
 */
export const LIST_REPOSITORIES = ['[].name', '[].project'] as const;

/**
 * `MAINTENANCE_DEPENDENCIES` (qits-2317): the dependencies of one kind (`?kind=INTERNAL` or
 * `?kind=EXTERNAL`, never the bare listing, which mixes in a repository's own modules), each with
 * its latest version (null when unknown, with the `error` that says why) and every pin of it: the
 * repository, the version it pins, where (`manifestPath`), and whether that pin is behind
 * (`pending`).
 */
export const LIST_DEPENDENCIES = [
  '[].ecosystem',
  '[].name',
  '[].latest',
  '[].error',
  '[].pins[].repository',
  '[].pins[].version',
  '[].pins[].manifestPath',
  '[].pins[].pending',
] as const;

/** One repository of the inventory, cut to what the Dependencies page reads. */
export type MaintenanceRepository = Consumed<
  GetMaintenanceApiRepositoriesResponses[200],
  typeof LIST_REPOSITORIES
>[number];

/** One dependency with its pins, cut to what the Dependencies page reads. */
export type DependencyEntry = Consumed<
  GetMaintenanceApiDependenciesResponses[200],
  typeof LIST_DEPENDENCIES
>[number];
