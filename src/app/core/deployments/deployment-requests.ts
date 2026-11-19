import type { QitsBadgeTone } from '@qits/ui-components';
import { payloadField, payloadIds, type WithPayload } from '$core/events/refresh-on';
import { formatInstant } from '$core/release-requests/release-request-model';

/**
 * A project's deployment requests as the Deployments section draws them (qits-2315): which are
 * still moving, what their gate said and what became of them. Ported from the retired
 * qits-deployments-frontend's `api/dto.ts`, `ui/status-badge.ts` and `ui/format.ts`, as pure
 * functions over the fields the page reads (`deployments.consumes.ts`).
 *
 * The client types every field optional; on the wire an unset one is `null`, so each check here
 * treats `null` and absent alike.
 */

/** The fields the gate and the split are decided by. */
export interface GatedRequest {
  readonly qualityGate?: string | null;
  readonly gateSettledAt?: string | null;
  readonly gateDetail?: string | null;
  readonly deployHold?: boolean | null;
  readonly deploymentStatus?: string | null;
}

/**
 * How many settled requests qits-deployments answers, restated for the caption alone: the server
 * caps them before they are on the wire, and a "Completed" heading that said nothing about it would
 * read as the project's whole release history.
 */
export const COMPLETED_SHOWN = 10;

/** The words `gateDetail` begins with while a request is held for a person (qits-2271). */
const HELD_DETAIL = 'held for manual approval';

/**
 * The deployment statuses qits-deployments has not finished with. `SPEC_UNREADABLE` is one: the
 * deployer reads the repository's `deployments.yml` again and deploys once it answers.
 * `DECLARATION_REFUSED` is not: nothing changes it but another release.
 */
const IN_FLIGHT: readonly string[] = ['QUEUED', 'STARTING', 'SPEC_UNREADABLE'];

/** Whether a deployment in `status` is still moving. */
export function isInFlight(status: string): boolean {
  return IN_FLIGHT.includes(status);
}

/** Whether the request still waits on its gate: asked, and nothing has answered. */
export function isPendingGate(request: GatedRequest): boolean {
  return request.qualityGate === 'UNMET' && request.gateSettledAt == null;
}

/** Whether the gate refused the request outright: it answered, and it queued nothing. */
export function isRefused(request: GatedRequest): boolean {
  return request.qualityGate === 'UNMET' && request.gateSettledAt != null;
}

/**
 * Whether the request is held for a person or an agent to approve, rather than waiting for a gate
 * to answer: a subset of {@link isPendingGate}. `deployHold` tells the two apart; a row without it
 * (an older answer) falls back to the sentence qits-deployments writes beside a hold.
 */
export function isHeldForApproval(request: GatedRequest): boolean {
  if (!isPendingGate(request)) return false;
  if (typeof request.deployHold === 'boolean') return request.deployHold;
  return (request.gateDetail ?? '').startsWith(HELD_DETAIL);
}

/**
 * Whether a person or an agent declined the request's hold (qits-2271): settled UNMET with
 * `declinedAt`, nothing queued, the release request WITHDRAWN. A decline is final.
 */
export function isDeclined(request: { readonly declinedAt?: string | null }): boolean {
  return request.declinedAt != null;
}

/**
 * Whether nothing about the request will change again: the split the page draws its two sections
 * along. It mirrors qits-deployments' `RequestLifecycle`, which partitions the listing the same way
 * before capping the settled ones. A refusal is completed (no deployment, nothing to wait for).
 */
export function isCompletedRequest(request: GatedRequest): boolean {
  if (isPendingGate(request)) return false;
  const status = request.deploymentStatus;
  return status == null || !isInFlight(status);
}

/** The gate's word: held, in the gate, met or unmet. */
export function gateLabel(request: GatedRequest): string {
  if (isHeldForApproval(request)) return 'Held for approval';
  if (isPendingGate(request)) return 'In the gate';
  return request.qualityGate === 'MET' ? 'Gate met' : 'Gate unmet';
}

/**
 * The gate's tone: `success` for a version let through, `warning` for one that was not or that
 * waits on a person (nothing failed: the platform declined, or holds), `info` while nothing has
 * answered.
 */
export function gateTone(request: GatedRequest): QitsBadgeTone {
  if (isHeldForApproval(request)) return 'warning';
  if (isPendingGate(request)) return 'info';
  return request.qualityGate === 'MET' ? 'success' : 'warning';
}

/**
 * What became of a request with no deployment status: nothing queued while the gate is pending,
 * nothing deployed after a refusal, else a deployment row the platform no longer has.
 */
export function deploymentOutcome(request: GatedRequest): string {
  if (isPendingGate(request)) return 'nothing queued yet';
  return isRefused(request) ? 'nothing was deployed' : 'no deployment row';
}

/** Each priority's word; a value this build does not know shows its raw word. */
const PRIORITY_LABELS: Readonly<Record<string, string>> = {
  LOWEST: 'Lowest',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  HIGHER: 'Higher',
  BLOCKING: 'Blocking',
};

/**
 * Each priority's tone: only the loud ones are loud. `MEDIUM` is every release's default, so it and
 * the two below it are neutral; `BLOCKING` is a claim on somebody's attention.
 */
const PRIORITY_TONES: Readonly<Record<string, QitsBadgeTone>> = {
  LOWEST: 'neutral',
  LOW: 'neutral',
  MEDIUM: 'neutral',
  HIGH: 'info',
  HIGHER: 'warning',
  BLOCKING: 'danger',
};

/**
 * The priority's word, or `''` for a release that announced none (the cell stays blank rather than
 * claim a Medium no release asked for).
 */
export function priorityLabel(priority: string | null | undefined): string {
  return priority ? (PRIORITY_LABELS[priority] ?? priority) : '';
}

/** The priority's tone; neutral for a word this build does not know. */
export function priorityTone(priority: string | null | undefined): QitsBadgeTone {
  return PRIORITY_TONES[priority ?? ''] ?? 'neutral';
}

/**
 * Each deployment status's tone. A stopped application (`SCALED_TO_ZERO`) is a warning, not
 * ordinary history; a refused declaration is a failure, as nothing but another release moves it.
 */
const STATUS_TONES: Readonly<Record<string, QitsBadgeTone>> = {
  QUEUED: 'neutral',
  STARTING: 'info',
  ACTIVE: 'success',
  IMAGE_MISSING: 'warning',
  SPEC_UNREADABLE: 'warning',
  DECLARATION_REFUSED: 'danger',
  ROLLED_BACK: 'warning',
  FAILED: 'danger',
  GONE: 'danger',
  SCALED_TO_ZERO: 'warning',
  DECOMMISSIONED: 'neutral',
  SUPERSEDED: 'neutral',
};

/** Each deployment status's word. */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  QUEUED: 'Queued',
  STARTING: 'Starting',
  ACTIVE: 'Active',
  IMAGE_MISSING: 'Image missing',
  SPEC_UNREADABLE: 'Spec unreadable',
  DECLARATION_REFUSED: 'Declaration refused',
  ROLLED_BACK: 'Rolled back',
  FAILED: 'Failed',
  GONE: 'Gone',
  SCALED_TO_ZERO: 'Stopped',
  DECOMMISSIONED: 'Decommissioned',
  SUPERSEDED: 'Superseded',
};

/** A deployment status's word; a status this build does not know shows its raw word. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** A deployment status's tone; neutral for a status this build does not know. */
export function statusTone(status: string): QitsBadgeTone {
  return STATUS_TONES[status] ?? 'neutral';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => value.toString().padStart(2, '0');

/** `31 Jul 14:09` in UTC, the table's timestamp (no year: the table is about recency); `—` if missing. */
export function formatDayTime(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : undefined;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/**
 * The domain events after which a project's deployment requests may have changed: a deployment
 * queued, started, active or failed (a rollback among them), a held request declined, and a
 * release published (`SoftwareRelease`: qits-deployments asks for a deployment of it). A gate that
 * settles as a refusal or a hold sends none.
 */
export const DEPLOYMENT_REQUEST_EVENTS = [
  'DeploymentQueued',
  'DeploymentStarted',
  'DeploymentActive',
  'DeploymentFailed',
  'DeploymentRequestDeclined',
  'SoftwareRelease',
] as const;

/** What the page shows, as far as {@link affectsDeploymentRequests} narrows by it. */
export interface ShownDeploymentRequests {
  /** The requests on screen. */
  readonly requests: readonly (GatedRequest & {
    readonly id?: string | null;
    readonly applicationName?: string | null;
  })[];
  /** The repositories (by name) a release of which concerns the project. */
  readonly repositories: ReadonlySet<string>;
}

/**
 * Whether `event` may have changed the project's deployment requests on screen. A deployment event
 * names an application and a version, never a project: it counts when its `applicationName` is one
 * on screen, or while a request is pending (the new deployment may be that one's). A decline
 * counts when its `deploymentRequestId` is on screen. A `SoftwareRelease` counts when its
 * `repository` is one of `shown.repositories`.
 */
export function affectsDeploymentRequests(
  event: WithPayload,
  shown: ShownDeploymentRequests,
): boolean {
  const name = event.name ?? '';
  if (name === 'SoftwareRelease') {
    const repository = payloadIds(event).repositoryId;
    return !!repository && shown.repositories.has(repository);
  }
  if (name === 'DeploymentRequestDeclined') {
    const id = payloadField(event, 'deploymentRequestId');
    return !!id && shown.requests.some((request) => request.id === id);
  }
  if (shown.requests.some((request) => !isCompletedRequest(request))) return true;
  const application = payloadField(event, 'applicationName');
  return !!application && shown.requests.some((r) => r.applicationName === application);
}

/**
 * The variants a main application's request declares (`variants`) that no request of the same
 * release deploys yet (`variant`), in declared order (qits-2323): their requests are still to
 * come. A variant's own request (`variant` set) declares none.
 */
export function variantsToCome(
  request: { readonly variant?: string | null; readonly variants?: readonly string[] | null },
  release: readonly { readonly variant?: string | null }[],
): readonly string[] {
  if (request.variant) return [];
  const deployed = new Set(release.map((other) => other.variant).filter(Boolean));
  return (request.variants ?? []).filter((variant) => !deployed.has(variant));
}

/** What the request's page narrows the events by (qits-2322): the request on show. */
export interface ShownDeploymentRequest {
  readonly id?: string | null;
  readonly applicationName?: string | null;
  readonly repoId?: string | null;
}

/**
 * Whether `event` may have changed the deployment request on show (qits-2322). A deployment event
 * counts when its `applicationName` is the request's (its own deployment, or a newer one taking
 * the tier over); `DeploymentRequestDeclined` when its `deploymentRequestId` is the request's
 * (a decline settles every held request of the release request, made anywhere); `SoftwareRelease`
 * when its `repository` is the request's `repoId` (a newer release may take the hold's place).
 * Nothing counts before the request is read.
 */
export function affectsDeploymentRequest(
  event: WithPayload,
  shown: ShownDeploymentRequest | undefined,
): boolean {
  if (!shown?.id) return false;
  const name = event.name ?? '';
  if (name === 'SoftwareRelease') {
    const repository = payloadIds(event).repositoryId;
    return !!repository && repository === shown.repoId;
  }
  if (name === 'DeploymentRequestDeclined') {
    return payloadField(event, 'deploymentRequestId') === shown.id;
  }
  const application = payloadField(event, 'applicationName');
  return !!application && application === shown.applicationName;
}

/**
 * How far a version got, at one tile of the request's lifecycle: it happened, it has not happened
 * yet, or it was going to happen and stopped.
 */
export type LifecycleState = 'reached' | 'pending' | 'stopped';

/** One tile of the lifecycle: what the step is, its one line, whether it happened. */
export interface LifecycleStage {
  readonly id: 'released' | 'tier' | 'merged';
  readonly title: string;
  /** The line under the title: a timestamp, a version, or why the tile cannot say more. */
  readonly meta: string;
  readonly state: LifecycleState;
  /** Why a `stopped` tile stopped, in the server's own word. */
  readonly detail?: string;
}

/** The request's fields the lifecycle is decided by. */
export interface LifecycleRequest extends GatedRequest {
  readonly version?: string | null;
  readonly applicationName?: string | null;
  readonly environmentId?: string | null;
  readonly repoId?: string | null;
  readonly createdAt?: string | null;
}

/** One deployment of the tier, as far as the lifecycle reads it. */
export interface LifecycleDeployment {
  readonly applicationName?: string | null;
  readonly version?: string | null;
  readonly status?: string | null;
  readonly createdAt?: string | null;
}

/** One release request, as far as the merge tile reads it. */
export interface LifecycleReleaseRequest {
  readonly repoId?: string | null;
  readonly repoName?: string | null;
  readonly version?: string | null;
  readonly mergedToMainAt?: string | null;
}

/**
 * A read a tile depends on: its answer, still on its way, or failed. Only the request's own read
 * can fail the page; each of these degrades its tile alone.
 */
export type TileRead<T> =
  | { readonly status: 'loaded'; readonly value: T }
  | { readonly status: 'loading' }
  | { readonly status: 'error' };

/** What the lifecycle is built from: the request and the three reads that decide its tiles. */
export interface LifecycleFacts {
  readonly request: LifecycleRequest;
  /** The tier's deployments (`listDeployments?environmentId=`). */
  readonly deployments: TileRead<readonly LifecycleDeployment[]>;
  /** Every tier, for the name of the request's (its id when unread). */
  readonly environments: readonly { readonly id?: string | null; readonly name?: string | null }[];
  /** The project's release requests, for whether this version reached main. */
  readonly releaseRequests: TileRead<readonly LifecycleReleaseRequest[]>;
}

/** The word a status is drawn with on a stopped tile, where the badge has no room. */
const STOPPED_WORDS: Readonly<Record<string, string>> = {
  IMAGE_MISSING: 'no image was published',
  DECLARATION_REFUSED: 'its configuration declaration was refused',
  FAILED: 'the deployment failed',
  ROLLED_BACK: 'rolled back to the predecessor',
  GONE: 'the container went away',
  SCALED_TO_ZERO: 'stopped on purpose',
  SUPERSEDED: 'a newer deployment took its place',
  DECOMMISSIONED: 'replaced by a newer deployment',
};

/** Why a finished request never got its version serving, in the server's own vocabulary. */
export function stoppedWord(request: GatedRequest): string {
  if (isRefused(request)) return 'the gate refused it';
  const status = request.deploymentStatus;
  return status ? (STOPPED_WORDS[status] ?? status) : 'no deployment was recorded';
}

/** What a still-moving request waits on. */
export function movingWord(request: GatedRequest): string {
  if (isHeldForApproval(request)) return 'held for manual approval';
  return isPendingGate(request) ? 'waiting on the quality gate' : 'deploying';
}

/**
 * The newest ACTIVE deployment of `applicationName` among `deployments`, by its own `createdAt`
 * (the order the list arrives in is not relied on).
 */
export function newestActive(
  deployments: readonly LifecycleDeployment[],
  applicationName: string | null | undefined,
): LifecycleDeployment | undefined {
  const time = (deployment: LifecycleDeployment) => Date.parse(deployment.createdAt ?? '') || 0;
  return deployments
    .filter((d) => d.applicationName === applicationName && d.status === 'ACTIVE')
    .sort((left, right) => time(right) - time(left))[0];
}

/**
 * A deployment request's lifecycle, left to right (qits-2322, ported from the retired
 * qits-deployments-frontend's request page): released → running in the request's tier → merged to
 * main.
 *
 * - **Released** is always reached: a request exists because a release was cut.
 * - **Running in <tier>** asks the place, not the request's own deployment: reached when the
 *   tier's newest ACTIVE deployment of the application has this version (a deployment that was
 *   ACTIVE an hour ago may have been replaced since). A completed request that is not serving
 *   stopped, with why ({@link stoppedWord}); otherwise it is pending on what it waits for
 *   ({@link movingWord}). No `environmentId` is pending, "no environment recorded"; a tier read
 *   still on its way or failed says so.
 * - **Merged to main** is the one step qits-deployments cannot see: matched by version among the
 *   project's release requests of the request's repository (`repoId`, a repository's name or id).
 *   A failed read, or a request naming no repository, is pending with why, never a page error.
 */
export function requestLifecycle(facts: LifecycleFacts): readonly LifecycleStage[] {
  const { request } = facts;
  return [
    {
      id: 'released',
      title: `Released ${request.version ?? ''}`.trim(),
      meta: formatInstant(request.createdAt),
      state: 'reached',
    },
    tierStage(facts),
    mergedStage(facts),
  ];
}

function tierStage({ request, deployments, environments }: LifecycleFacts): LifecycleStage {
  const id = 'tier';
  if (!request.environmentId) {
    return { id, title: 'Running', meta: 'no environment recorded', state: 'pending' };
  }
  const tier = environments.find((environment) => environment.id === request.environmentId);
  const name = tier?.name ?? request.environmentId;
  const title = `Running in ${name}`;
  if (deployments.status === 'loading') {
    return { id, title, meta: 'reading the tier’s deployments…', state: 'pending' };
  }
  if (deployments.status === 'error') {
    return { id, title, meta: 'the tier’s deployments could not be read', state: 'pending' };
  }
  const serving = newestActive(deployments.value, request.applicationName);
  if (serving && serving.version === request.version) {
    return { id, title, meta: `since ${formatInstant(serving.createdAt)}`, state: 'reached' };
  }
  if (isCompletedRequest(request)) {
    return {
      id,
      title,
      meta: serving?.version
        ? `${name} is running ${serving.version}`
        : `nothing is serving ${name}`,
      state: 'stopped',
      detail: stoppedWord(request),
    };
  }
  return { id, title, meta: movingWord(request), state: 'pending' };
}

function mergedStage({ request, releaseRequests }: LifecycleFacts): LifecycleStage {
  const id = 'merged';
  const title = 'Merged to main';
  const repository = request.repoId;
  if (!repository) {
    return { id, title, meta: 'this release named no repository', state: 'pending' };
  }
  if (releaseRequests.status === 'loading') {
    return { id, title, meta: 'reading the release requests…', state: 'pending' };
  }
  if (releaseRequests.status === 'error') {
    return { id, title, meta: 'the release requests could not be read', state: 'pending' };
  }
  const matched = releaseRequests.value.find(
    (candidate) =>
      candidate.version === request.version &&
      (candidate.repoName === repository || candidate.repoId === repository),
  );
  if (matched?.mergedToMainAt) {
    return { id, title, meta: formatInstant(matched.mergedToMainAt), state: 'reached' };
  }
  return {
    id,
    title,
    meta: matched ? 'not merged yet' : 'no release request carries this version',
    state: 'pending',
  };
}
