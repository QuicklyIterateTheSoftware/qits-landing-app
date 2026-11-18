import type { QitsBadgeTone } from '@qits/ui-components';
import { payloadField, payloadIds, type WithPayload } from '$core/events/refresh-on';

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
 * A deployment request's own page, on the deployments frontend:
 * `<origin>/<slug>/deployment-requests/<id>`; undefined without an origin (the server render) or an
 * id. Until qits-2322 moves that page here.
 */
export function deploymentRequestHref(
  origin: string,
  slug: string,
  id: string | null | undefined,
): string | undefined {
  return id && origin
    ? `${origin}/${slug}/deployment-requests/${encodeURIComponent(id)}`
    : undefined;
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
