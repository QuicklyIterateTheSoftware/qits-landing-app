import { NOTHING, type Consumed } from '@qits/angular';
import type {
  CreateRunnerResponses,
  GetRunnerHealthResponses,
  GreenlightRunnerResponses,
  ListRunnersResponses,
  PatchRunnerResponses,
} from '../../api/workspaces';

/**
 * What `RunnersStore` reads from qits-workspaces' runner doors, for the Runners page (epic
 * qits-1230). The store passes each list to `consume(...)`, so it cannot read any other field, and
 * its pact spec passes the same lists as `consumes`. To read another field, add it here.
 *
 * A runner's `login` and `health` are read whole: the service answers `null` for a runner that has
 * reported neither yet, and the pact binds whichever of the two the recorded state holds.
 */

/**
 * `RunnersStore.load()`: every runner, with its connection, version, slot counts, memory caps,
 * quarantine, last health check (`health`, and the older `lastHealthCheck*` it falls back to),
 * the node's agent login and the commands that sign it in.
 */
export const LIST_RUNNERS = [
  '[].id',
  '[].name',
  '[].description',
  '[].slots',
  '[].workspaceMemoryLimit',
  '[].workspaceMemorySwapLimit',
  '[].version',
  '[].login',
  '[].registered',
  '[].quarantined',
  '[].quarantinedAt',
  '[].quarantineReason',
  '[].lastSeenAt',
  '[].lastHealthCheckAt',
  '[].lastHealthCheckOk',
  '[].connected',
  '[].connectedSince',
  '[].pinnedVersion',
  '[].running',
  '[].owned',
  '[].queued',
  '[].loginCommand',
  '[].kimiLoginCommand',
  '[].loginCommandPending',
  '[].health',
] as const;

/** One runner, cut to what the store reads. */
export type Runner = Consumed<ListRunnersResponses[200], typeof LIST_RUNNERS>[number];

/**
 * `RunnersStore.loadHealth(id)`: the node details, the newest health check with every check's
 * `data` (drawn as `key: value` entries). A runner never checked answers 204, which binds nothing.
 */
export const GET_RUNNER_HEALTH = ['checks[].name', 'checks[].ok', 'checks[].data'] as const;

/** A runner's newest health check, cut to what the store reads. */
export type RunnerHealth = Consumed<GetRunnerHealthResponses[200], typeof GET_RUNNER_HEALTH>;

/**
 * `RunnersStore.createRunner(…)` and `rotateToken(id)`: the runner's name and the one-time install
 * line and registration token, which the page shows once and holds nowhere else.
 */
export const RUNNER_REGISTRATION = ['runner.name', 'registrationToken', 'installLine'] as const;

/** A registration, cut to what the store reads. */
export type RunnerRegistration = Consumed<CreateRunnerResponses[201], typeof RUNNER_REGISTRATION>;

/** `RunnersStore.patchRunner(id, …)`: the runner as saved; the page reads the list again. */
export const PATCH_RUNNER = [
  'slots',
  'description',
  'workspaceMemoryLimit',
  'workspaceMemorySwapLimit',
] as const;

/** A saved runner, cut to what the store reads. */
export type PatchedRunner = Consumed<PatchRunnerResponses[200], typeof PATCH_RUNNER>;

/** `RunnersStore.greenlight(id)`: the runner, its quarantine lifted. */
export const GREENLIGHT_RUNNER = ['quarantined'] as const;

/** A greenlit runner, cut to what the store reads. */
export type GreenlitRunner = Consumed<GreenlightRunnerResponses[200], typeof GREENLIGHT_RUNNER>;

/**
 * `RunnersStore.requestHealthcheck(id)`, `requestLoginCheck(id)` and `deleteRunner(id)`: only the
 * status. A check is queued (202), and its result arrives with a later read of the list.
 */
export const STATUS_ONLY = NOTHING;

/**
 * A delete refused while the runner still owns ACTIVE workspaces (409 `RUNNER_OWNS_WORKSPACES`):
 * the service's words, the refusal's name, and the workspaces' row ids the page links to.
 */
export const OWNS_WORKSPACES_REFUSAL = ['message', 'code', 'workspaceIds'] as const;
