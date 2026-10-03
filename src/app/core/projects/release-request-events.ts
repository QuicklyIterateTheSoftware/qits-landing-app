import { payloadProjectId, type DomainEvent } from '$core/events/domain-events';
import type { ReleaseRequestEntry } from './projects.consumes';

/**
 * The domain events after which a project's release requests may have changed: a request moved
 * (created, folded, withdrawn, released…), a release or an artifact landed, a build ended, or a
 * deployment finished — `DeploymentFailed` is also what a swarm rollback emits.
 */
export const RELEASE_REQUEST_EVENTS = [
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
