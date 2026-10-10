import { fromGoldenMasters } from '@qits/angular/testing/browser';
import { commands } from 'vitest/browser';

/** Each provider's repository name, as its pact and the guard's messages name it. */
const REPOSITORY = {
  'qits-projects': 'qits-projects-service',
  'qits-githost': 'qits-githost-service',
  'qits-events': 'qits-events-service',
  'qits-maintenance': 'qits-maintenance-service',
  'qits-workspaces': 'qits-workspaces-service',
  'qits-ci': 'qits-ci-service',
} as const;

/** A provider whose golden masters the browser specs read. */
export type Provider = keyof typeof REPOSITORY;

/**
 * The body `provider` (default qits-projects) recorded for `operationId` in `state`, as a
 * recording: deep-frozen, and accepted by the guard (`setup.ts`). The one place that registers
 * recordings; a spec `flush(...)`es what this gives, or a part of it, as it is. The Node side
 * gives only a (state, operation) the committed pact uses (`vitest-browser.config.ts`).
 */
export const goldenMaster = fromGoldenMasters(
  (state: string, operationId: string, provider?: Provider) =>
    commands.goldenMaster(state, operationId, provider),
  (state, operationId, provider = 'qits-projects') => ({
    provider: REPOSITORY[provider],
    state,
    operationId,
  }),
);
