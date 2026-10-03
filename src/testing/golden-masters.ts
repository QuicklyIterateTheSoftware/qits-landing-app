import { goldenMasters } from '@qits/angular/testing';

/** qits-projects' golden masters (epic qits-546), from its npm package. */
export const projectsGoldenMasters = goldenMasters(
  '@qits/projects-golden-masters',
  'qits-projects',
);

/** qits-githost's golden masters (epic qits-112), from its npm package. */
export const githostGoldenMasters = goldenMasters('@qits/githost-golden-masters', 'qits-githost');

/** qits-maintenance's golden masters (epic qits-112), from its npm package. */
export const maintenanceGoldenMasters = goldenMasters(
  '@qits/maintenance-golden-masters',
  'qits-maintenance',
);

/** qits-events' golden masters (epic qits-112), from its npm package. */
export const eventsGoldenMasters = goldenMasters('@qits/events-golden-masters', 'qits-events');

/** qits-workspaces' golden masters (epic qits-112), from its npm package. */
export const workspacesGoldenMasters = goldenMasters(
  '@qits/workspaces-golden-masters',
  'qits-workspaces',
);

/** The body qits-projects recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const goldenMaster = <T = any>(state: string, operationId: string): T =>
  projectsGoldenMasters.body<T>(state, operationId);

/** The body qits-githost recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const githostGoldenMaster = <T = any>(state: string, operationId: string): T =>
  githostGoldenMasters.body<T>(state, operationId);

/** The body qits-events recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const eventsGoldenMaster = <T = any>(state: string, operationId: string): T =>
  eventsGoldenMasters.body<T>(state, operationId);

/** The body qits-maintenance recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const maintenanceGoldenMaster = <T = any>(state: string, operationId: string): T =>
  maintenanceGoldenMasters.body<T>(state, operationId);

/** The body qits-workspaces recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const workspacesGoldenMaster = <T = any>(state: string, operationId: string): T =>
  workspacesGoldenMasters.body<T>(state, operationId);
