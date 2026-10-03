import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { workspacesGoldenMasters as masters } from '../../../testing/golden-masters';
import { LIST_OPEN_WORKSPACES, LIST_WORK_ITEM_WORKSPACES } from './workspaces.consumes';
import { WorkspacesStore } from './workspaces.store';

/**
 * qits-landing-app's pact with qits-workspaces-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-workspaces-service.json`.
 *
 * The store is the only user of the qits-workspaces client, so this file is the whole pact: the
 * open workspaces the cards link to, and one item's workspaces in every state for its page — an
 * item with three (ACTIVE, INTEGRATED, ABANDONED), and one with none. It binds only
 * `LIST_OPEN_WORKSPACES` and `LIST_WORK_ITEM_WORKSPACES`, the lists the store passes to
 * `consume(...)`. qits-workspaces' states share their ids with qits-projects' "… in detail" states.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const BOUND = 'a project with workspaces bound to work items';
const NONE = 'a work item with no workspaces';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-workspaces-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** A store on a server platform, its client pointed at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspacesClient),
    ],
  });
  workspacesClient.setConfig({ baseUrl: url });
  return TestBed.inject(WorkspacesStore);
}

/** `state`'s param `name` for `operationId`. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

describe('qits-landing-app → qits-workspaces-service pact', () => {
  afterAll(() => {
    workspacesClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-open-workspaces: the store holds the items with an active workspace', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: BOUND,
      operationId: 'listOpenWorkspaces',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-open-workspaces' },
      consumes: LIST_OPEN_WORKSPACES,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      expect(store.status()).toBe('loaded');
      // The mock server answers each id with a value of the recorded shape, not the recorded one.
      expect(store.openWorkIds().length).toBeGreaterThan(0);
      expect(store.hasOpen(store.openWorkIds()[0])).toBe(true);
    }));

  it('show-work-item-workspaces: the store holds an item’s workspaces, newest first', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: BOUND,
      operationId: 'listWorkItemWorkspaces',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item-workspaces' },
      consumes: LIST_WORK_ITEM_WORKSPACES,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const ref = param(BOUND, 'listWorkItemWorkspaces', 'bugTicketId');
      await store.loadHistory(ref);
      const history = store.historyOf(ref)!;
      expect(history.status).toBe('loaded');
      // One entry per shape: open (no `resolvedAt`) and closed.
      expect(history.entries.map((w) => w.status)).toContain('ACTIVE');
      expect(history.entries.every((w) => !!w.createdAt && !!w.branch)).toBe(true);
    }));

  it('show-work-item-workspaces: the store holds no workspaces for an item without any', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: NONE,
      operationId: 'listWorkItemWorkspaces',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item-workspaces' },
      consumes: LIST_WORK_ITEM_WORKSPACES,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const ref = param(NONE, 'listWorkItemWorkspaces', 'improvementTicketId');
      await store.loadHistory(ref);
      expect(store.historyOf(ref)).toEqual({ status: 'loaded', entries: [] });
    }));
});
