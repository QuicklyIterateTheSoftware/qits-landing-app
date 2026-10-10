import { goldenMasters, type GoldenMasters } from '@qits/angular/testing';

/**
 * `masters` with a query the index writes into `path` (`…/changes/diff?path=README.md`) moved to
 * `query`, so a pact's path is the route alone and its query is the query.
 */
function queryOutOfPath(masters: GoldenMasters): GoldenMasters {
  return {
    operation(state, operationId) {
      const op = masters.operation(state, operationId);
      const at = op.path.indexOf('?');
      if (at < 0) return op;
      const query = Object.fromEntries(new URLSearchParams(op.path.slice(at + 1)));
      return { ...op, path: op.path.slice(0, at), query: { ...query, ...op.query } };
    },
    body: (state, operationId) => masters.body(state, operationId),
  };
}

/** qits-projects' golden masters (epic qits-546), from its npm package. */
export const projectsGoldenMasters = queryOutOfPath(
  goldenMasters('@qits/projects-golden-masters', 'qits-projects'),
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

/** qits-ci's golden masters (epic qits-112), from its npm package. */
export const ciGoldenMasters = goldenMasters('@qits/ci-golden-masters', 'qits-ci');

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

/** The body qits-ci recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const ciGoldenMaster = <T = any>(state: string, operationId: string): T =>
  ciGoldenMasters.body<T>(state, operationId);

/**
 * The paths of `consumes` that the recording of `operationId` in `state` holds. A field under a
 * recorded `null` (no `conflict`, no automation `failure`) cannot be bound in that state: the pact
 * binds it in a state whose recording has it. A path the recording holds stays, `null` included.
 */
export function heldBy(
  masters: GoldenMasters,
  state: string,
  operationId: string,
  consumes: readonly string[],
): readonly string[] {
  const body = masters.body(state, operationId);
  const holds = (value: unknown, steps: readonly string[]): boolean => {
    if (steps.length === 0) return true;
    const [step, ...rest] = steps;
    if (step === '[]') {
      return Array.isArray(value) && (value.length === 0 || value.some((v) => holds(v, rest)));
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    return step in value && holds((value as Record<string, unknown>)[step], rest);
  };
  const steps = (path: string) =>
    path.split('.').flatMap((part) => {
      const name = part.replace(/(\[\])+$/, '');
      const arrays = (part.length - name.length) / 2;
      return [...(name ? [name] : []), ...Array<string>(arrays).fill('[]')];
    });
  return consumes.filter((path) => holds(body, steps(path)));
}
