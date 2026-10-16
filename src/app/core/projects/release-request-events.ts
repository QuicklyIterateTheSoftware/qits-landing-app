import { payloadProjectId, type DomainEvent } from '$core/events/domain-events';
import { payloadField } from '$core/events/refresh-on';
import type { ReleaseRequestEntry } from './projects.consumes';

/**
 * The domain events after which a project's release requests may have changed: a request moved
 * (`ReleaseRequestStateChanged`: created, folded, released, finalized, withdrawn, superseded…) or
 * one of its fields changed (`ReleaseRequestChanged`), a release or an artifact landed, a build
 * ended, or a deployment finished — `DeploymentFailed` is also what a swarm rollback emits.
 *
 * `ReleaseRequestStateChanged` is the only event some moves send: a wrapper repository, which has
 * no deployment, goes READY → RELEASED → FINALIZED by it alone (qits-1270: without it the
 * lightning menu never refreshed).
 */
export const RELEASE_REQUEST_EVENTS = [
  'ReleaseRequestStateChanged',
  'ReleaseRequestChanged',
  'SCMRelease',
  'SoftwareRelease',
  'BuildSuccessful',
  'BuildFailed',
  'DeploymentActive',
  'DeploymentFailed',
] as const;

/** Deployment events name an application, not a project, so they cannot be filtered by project. */
const DEPLOYMENT_EVENTS = new Set(['DeploymentActive', 'DeploymentFailed']);

/**
 * Whether `event` may have changed the release requests of `projectId`, whose pending requests are
 * `pending`. A project-scoped event counts when its payload names that project. A deployment event
 * names no project; it counts while one of the project's requests is RELEASED and waiting for its
 * deployment, and is ignored otherwise.
 */
export function affectsReleaseRequests(
  event: DomainEvent,
  projectId: string,
  pending: readonly ReleaseRequestEntry[],
): boolean {
  if (DEPLOYMENT_EVENTS.has(event.name ?? '')) {
    return pending.some((request) => request.state === 'RELEASED');
  }
  return payloadProjectId(event) === projectId;
}

/**
 * The release request `event` is about (`releaseRequestId`, the request's id); undefined when it
 * names none: a deployment, a `SoftwareRelease`, a build of a branch that is not a request's.
 */
export function releaseRequestIdOf(event: DomainEvent): string | undefined {
  return payloadField(event, 'releaseRequestId');
}

/**
 * Whether `event` can change which requests a list holds, or their order: a state move
 * (`ReleaseRequestStateChanged`, a creation among them, which names no `previousState`; withdrawn,
 * superseded, finalized…). Any other event changes at most the one row it names
 * (`ReleaseRequestChanged`: its priority, backing branch, merged commit, pre-run; a build or a
 * release of it).
 */
export function changesReleaseRequestList(event: DomainEvent): boolean {
  return event.name === 'ReleaseRequestStateChanged';
}

/**
 * What a burst of release-request events asks a subscriber to read again: the whole `list` when one
 * of them can move it ({@link changesReleaseRequestList}) or names no request (a deployment cannot
 * be pinned to a row), else just the `rows` they name.
 */
export function releaseRequestRefresh(events: readonly DomainEvent[]): {
  readonly list: boolean;
  readonly rows: readonly string[];
} {
  const rows = new Set<string>();
  let list = false;
  for (const event of events) {
    const id = releaseRequestIdOf(event);
    if (changesReleaseRequestList(event) || id === undefined) list = true;
    else rows.add(id);
  }
  return { list, rows: [...rows] };
}
