import { goldenMasters } from '@qits/angular/testing';

/** qits-projects' golden masters (epic qits-546), from its npm package. */
export const projectsGoldenMasters = goldenMasters(
  '@qits/projects-golden-masters',
  'qits-projects',
);

/** qits-githost's golden masters (epic qits-112), from its npm package. */
export const githostGoldenMasters = goldenMasters('@qits/githost-golden-masters', 'qits-githost');

/** The body qits-projects recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const goldenMaster = <T = any>(state: string, operationId: string): T =>
  projectsGoldenMasters.body<T>(state, operationId);

/** The body qits-githost recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const githostGoldenMaster = <T = any>(state: string, operationId: string): T =>
  githostGoldenMasters.body<T>(state, operationId);
