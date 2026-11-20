import { payloadField, type WithPayload } from '$core/events/refresh-on';
import type { SwarmServiceDetail, SwarmServiceTask } from './swarm-service.consumes';

/** The label the platform's deployer puts on every service it runs: the application's name. */
export const APP_NAME_LABEL = 'qits.platform.deployments.app-name';

/**
 * Whether a deployment event can have changed `service` (qits-2345): one of the application the
 * service's {@link APP_NAME_LABEL} names. A service without that label (not the deployer's), and
 * no service shown yet (a 404 a deployment may answer next time), follow every deployment.
 */
export function concernsSwarmService(
  event: WithPayload,
  service: Pick<SwarmServiceDetail, 'labels'> | undefined,
): boolean {
  const application = service?.labels?.[APP_NAME_LABEL];
  if (!application) return true;
  return payloadField(event, 'applicationName') === application;
}

/** Whether `task` runs another image than its service's (the tasks table shows only those). */
export function runsOtherImage(
  task: Pick<SwarmServiceTask, 'image'>,
  service: Pick<SwarmServiceDetail, 'image'>,
): boolean {
  return !!task.image && task.image !== service.image;
}

/** A swarm id shortened as docker prints it (12 characters); the whole id when shorter. */
export function shortSwarmId(id: string | undefined): string {
  return (id ?? '').slice(0, 12);
}
