import { goldenMasters } from './golden-master-pact';

/** qits-projects' golden masters (epic qits-546), from its npm package. */
export const projectsGoldenMasters = goldenMasters(
  '@qits/projects-golden-masters',
  'qits-projects',
);

/** The body qits-projects recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const goldenMaster = <T = any>(state: string, operationId: string): T =>
  projectsGoldenMasters.body<T>(state, operationId);
