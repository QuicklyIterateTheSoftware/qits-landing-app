import { fromGoldenMasters, fromGoldenMasterTexts } from '@qits/angular/testing/browser';
import { commands } from 'vitest/browser';

/** Each provider's repository name, as its pact and the guard's messages name it. */
const REPOSITORY = {
  'qits-projects': 'qits-projects-service',
  'qits-githost': 'qits-githost-service',
  'qits-events': 'qits-events-service',
  'qits-maintenance': 'qits-maintenance-service',
  'qits-workspaces': 'qits-workspaces-service',
  'qits-ci': 'qits-ci-service',
  'qits-workspace-daemon': 'qits-workspace-daemon',
  'qits-system': 'qits-system-service',
  'qits-artifacts': 'qits-artifacts-service',
  'qits-network-access': 'qits-network-access-service',
  'qits-edge': 'qits-edge-service',
  'qits-observability': 'qits-observability-service',
  'qits-deployments': 'qits-deployments-service',
  'qits-idp': 'qits-idp-service',
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

/**
 * The text body `provider` (default qits-projects) recorded for `operationId` in `state` (a file
 * recorded as it is, such as a freeze's HTML), registered as a recording (`fromGoldenMasterTexts`,
 * qits-2058). A spec `flush(...)`es it as it is, to a request read as text. The Node side gives only
 * a (state, operation) the committed pact uses, as for `goldenMaster`.
 */
export const goldenMasterText = fromGoldenMasterTexts(
  (state: string, operationId: string, provider?: Provider) =>
    commands.goldenMasterText(state, operationId, provider),
  (state, operationId, provider = 'qits-projects') => ({
    provider: REPOSITORY[provider],
    state,
    operationId,
  }),
);

/**
 * A text body `provider` (default qits-projects) recorded as a JSON string, such as
 * qits-network-access' WireGuard configs (`text/plain` on the wire, `getPeerAppConfig`; qits-2262):
 * the string the recording holds, registered as a text recording. `goldenMasterText` would give the
 * file as it is, quotes and escapes included. A spec `flush(...)`es it as it is, to a request read
 * as text.
 */
export const goldenMasterString = fromGoldenMasterTexts(
  (state: string, operationId: string, provider?: Provider) =>
    commands.goldenMaster<string>(state, operationId, provider),
  (state, operationId, provider = 'qits-projects') => ({
    provider: REPOSITORY[provider],
    state,
    operationId,
  }),
);
