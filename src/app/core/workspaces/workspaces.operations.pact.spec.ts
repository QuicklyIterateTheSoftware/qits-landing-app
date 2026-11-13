import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { addGoldenInteraction } from '@qits/angular/testing';
import { workspacesGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { ACTIVE_AGENT_WORK, OPEN_WORKSPACES, WORK_ITEM_WORKSPACES } from './workspaces.operations';

/**
 * qits-landing-app's pact with qits-workspaces-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-workspaces-service.json`, its part beside
 * `agents.operations.pact.spec.ts`'s.
 *
 * The work section's workspace operations' part (`workspaces.operations.ts`, qits-2146): the open
 * workspaces the cards link to (`OPEN_WORKSPACES`), and one item's workspaces in every state for
 * its page (`WORK_ITEM_WORKSPACES`) — an item with three (ACTIVE, INTEGRATED, ABANDONED), and one
 * with none — and the ACTIVE agents, whose work the In Progress tab shows (`ACTIVE_AGENT_WORK`).
 * Each binds only its operation's `consumes` (`LIST_OPEN_WORKSPACES`, `LIST_WORK_ITEM_WORKSPACES`,
 * `LIST_ACTIVE_AGENTS`), and each test runs the operation's own `fetch` with the params
 * `WorkspacesStore` passed its client call. The interactions moved here from
 * `workspaces.store.pact.spec.ts` with the store (qits-2146), unchanged: the same descriptions,
 * states, requests and bound fields. qits-workspaces' states share their ids with qits-projects'
 * "… in detail" states.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/**
 * The operations this spec owns in the shared file; `agents.operations.pact.spec.ts` owns the
 * workspace pages' part (and their `listAgents`).
 */
const OPERATIONS: readonly OwnedOperation[] = [
  'listOpenWorkspaces',
  'listWorkItemWorkspaces',
  { operationId: 'listAgents', interactions: ['show-agent-work'] },
];

const BOUND = 'a project with workspaces bound to work items';
const NONE = 'a work item with no workspaces';
const NO_OPEN = 'no work item has an open workspace';
const AGENTS = 'a project with agents bound to work items';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-workspaces-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` on a server platform against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspacesClient),
    ],
  });
  workspacesClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** The items with an open workspace, as the store read them from `OPEN_WORKSPACES`. */
async function openWorkIds(url: string) {
  const { data, error } = await at(url, () => OPEN_WORKSPACES.fetch({}));
  expect(error).toBeUndefined();
  return (data?.entries ?? []).flatMap((e) => (e.workspace?.workId ? [e.workspace.workId] : []));
}

/** An item's workspaces, as the store read them from `WORK_ITEM_WORKSPACES`. */
async function historyOf(url: string, workRef: string) {
  const { data, error } = await at(url, () => WORK_ITEM_WORKSPACES.fetch({ path: { workRef } }));
  expect(error).toBeUndefined();
  return (data?.entries ?? []).flatMap((e) => (e.workspace ? [e.workspace] : []));
}

/** `state`'s param `name` for `operationId`. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

describe('qits-landing-app → qits-workspaces-service pact: the work workspace operations', () => {
  afterAll(() => {
    workspacesClient.setConfig({ baseUrl: '' });
    try {
      assertPactPart(
        join(dir, `${CONSUMER}-${PROVIDER}.json`),
        COMMITTED,
        OPERATIONS,
        'QITS_GOLDEN_UPDATE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('declares the provider this spec binds', () => {
    for (const op of [OPEN_WORKSPACES, ACTIVE_AGENT_WORK, WORK_ITEM_WORKSPACES]) {
      expect(op.provider).toBe(PROVIDER);
    }
  });

  it('show-open-workspaces: the store holds the items with an active workspace', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: BOUND,
      operationId: OPEN_WORKSPACES.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-open-workspaces' },
      consumes: OPEN_WORKSPACES.consumes,
    }).executeTest(async (server) => {
      // The mock server answers each id with a value of the recorded shape, not the recorded one.
      const ids = await openWorkIds(server.url);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids[0]).toBeTruthy();
    }));

  it('show-open-workspaces: the store holds no item when none has an active workspace', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: NO_OPEN,
      operationId: OPEN_WORKSPACES.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-open-workspaces' },
      consumes: OPEN_WORKSPACES.consumes,
    }).executeTest(async (server) => {
      expect(await openWorkIds(server.url)).toEqual([]);
    }));

  it('show-work-item-workspaces: the store holds an item’s workspaces, newest first', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: BOUND,
      operationId: WORK_ITEM_WORKSPACES.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item-workspaces' },
      consumes: WORK_ITEM_WORKSPACES.consumes,
    }).executeTest(async (server) => {
      const ref = param(BOUND, 'listWorkItemWorkspaces', 'bugTicketId');
      const entries = await historyOf(server.url, ref);
      // One entry per shape: open (no `resolvedAt`) and closed.
      expect(entries.map((w) => w.status)).toContain('ACTIVE');
      expect(entries.every((w) => !!w.createdAt && !!w.branch)).toBe(true);
    }));

  it('show-work-item-workspaces: the store holds no workspaces for an item without any', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: NONE,
      operationId: WORK_ITEM_WORKSPACES.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item-workspaces' },
      consumes: WORK_ITEM_WORKSPACES.consumes,
    }).executeTest(async (server) => {
      const ref = param(NONE, 'listWorkItemWorkspaces', 'improvementTicketId');
      expect(await historyOf(server.url, ref)).toEqual([]);
    }));

  it('show-agent-work: the store holds the items an active agent is on', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: AGENTS,
      operationId: ACTIVE_AGENT_WORK.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-agent-work' },
      consumes: ACTIVE_AGENT_WORK.consumes,
    }).executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        ACTIVE_AGENT_WORK.fetch({ query: { state: 'ACTIVE' } }),
      );
      expect(error).toBeUndefined();
      // The mock server answers each id with a value of the recorded shape, not the recorded one.
      const ids = (data?.agents ?? []).flatMap((a) => (a.workId ? [a.workId] : []));
      expect(ids.length).toBe(1);
      expect(ids[0]).toBeTruthy();
    }));
});
