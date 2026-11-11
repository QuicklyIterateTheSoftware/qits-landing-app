import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  goldenMasters,
  routeLedger,
  useRouteLookup,
  type GoldenMasters,
} from '@qits/angular/testing';

/**
 * Every golden interaction names the routes its call happens on (`qits-trigger.route`, ticket
 * qits-1946), from the route ledger the browser specs write (`npm run test:browser`). Every pact
 * spec imports this module, so the lookup is set before any interaction is added.
 */
useRouteLookup(routeLedger('src/testing/browser/routes.json'));

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
    text: (state, operationId) => masters.text(state, operationId),
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

/** qits-workspace-daemon's golden masters (epic qits-1230), from its npm package. */
export const workspaceDaemonGoldenMasters = goldenMasters(
  '@qits/workspace-daemon-golden-masters',
  'qits-workspace-daemon',
);

/** qits-ci's golden masters (epic qits-112), from its npm package. */
export const ciGoldenMasters = goldenMasters('@qits/ci-golden-masters', 'qits-ci');

/** qits-system's golden masters (epic qits-112), from its npm package. */
export const systemGoldenMasters = goldenMasters('@qits/system-golden-masters', 'qits-system');

/** qits-artifacts' golden masters (qits-1951: the docs store), from its npm package. */
export const artifactsGoldenMasters = goldenMasters(
  '@qits/artifacts-golden-masters',
  'qits-artifacts',
);

/** qits-network-access' golden masters (epic qits-1977), from its npm package. */
export const networkAccessGoldenMasters = goldenMasters(
  '@qits/network-access-golden-masters',
  'qits-network-access',
);

/**
 * qits-idp's golden masters (qits-2044), from its npm package. Only the browser spec of the sign-in
 * callback reads them: the token swap there is `@qits/angular`'s `QitsTokens`, not a store of this
 * app, so no pact spec of this app calls the idp (see `vitest-browser.config.ts`).
 */
export const idpGoldenMasters = goldenMasters('@qits/idp-golden-masters', 'qits-idp');

/**
 * Whether the installed `@qits/projects-golden-masters` records `operationId` in `state`. A spec of
 * a case the provider records from a later release than the pinned one skips itself until
 * qits-maintenance bumps the pin (`it.skipIf(!isRecorded(…))`), as the pact specs' interactions do.
 */
export function isRecorded(state: string, operationId: string): boolean {
  try {
    projectsGoldenMasters.operation(state, operationId);
    return true;
  } catch {
    return false;
  }
}

/**
 * The state that records an entity map (qits-1950): `@contracts/qits-projects`, whose newest
 * version names `qits-projects-service`, with an `entities.json` beside the routes bundle, from
 * `@qits/artifacts-golden-masters` from 2026.1109.145731 on.
 */
export const ENTITY_MAP_STATE = 'a published contracts bundle with an entity map';

/**
 * The state that records needs (epic qits-1899): a READY_FOR_DEV ticket needing another ticket at
 * VERIFIED (not met: it is REFINED), and a task needing a task of another feature at IMPLEMENTED
 * (met). Recorded by qits-projects from 2026.1106.140436 on.
 */
export const NEEDS_STATE = 'a ticket that needs another';

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

/** The body qits-workspace-daemon recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const workspaceDaemonGoldenMaster = <T = any>(state: string, operationId: string): T =>
  workspaceDaemonGoldenMasters.body<T>(state, operationId);

/** The body qits-system recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const systemGoldenMaster = <T = any>(state: string, operationId: string): T =>
  systemGoldenMasters.body<T>(state, operationId);

/** The body qits-network-access recorded for `operationId` in `state`, for a spec to `flush(...)`. */
export const networkAccessGoldenMaster = <T = any>(state: string, operationId: string): T =>
  networkAccessGoldenMasters.body<T>(state, operationId);

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

/**
 * qits-projects' own `golden-masters/index.json`, as its npm package carries it: the file a
 * release publishes into `@contracts/qits-projects` beside `entities.json` (qits-1945), so the
 * contracts pages' plain specs (qits-1994) answer an index read with it. No recording of
 * qits-artifacts holds an index, so the browser specs cannot.
 */
export function projectsGoldenIndex<T = any>(): T {
  const file = resolve(
    process.cwd(),
    'node_modules/@qits/projects-golden-masters/golden-masters/index.json',
  );
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}
