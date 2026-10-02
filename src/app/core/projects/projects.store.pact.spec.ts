import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { addGoldenInteraction, assertPactFile } from '../../../testing/golden-master-pact';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { ProjectsStore } from './projects.store';

/**
 * qits-landing-app's pact with qits-projects-service (epic qits-546). Both sides are named by
 * repository, so the file is `pacts/qits-landing-app_qits-projects-service.json`.
 *
 * The store is the only user of the qits-projects client, so this file is the whole pact. Each test
 * drives one store method, as the UI interaction named in `interactions.ts` does, against a pact
 * mock server that answers with qits-projects' golden master, and checks what the store made of it.
 *
 * The run writes the pact to a fresh directory (pact-js names it `<consumer>-<provider>.json`);
 * `afterAll` compares it with the committed file and fails on a difference
 * (`QITS_GOLDEN_UPDATE=true npm test` rewrites it). A fresh directory, because pact-js merges into
 * an existing file and would keep an interaction no test makes anymore.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Adds the interaction for (state, operation), triggered by the UI interaction `slug`. */
const given = (slug: InteractionSlug, state: string, operationId: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
  });

/**
 * A store on a server platform, so `onInit` does not load the list by itself: each test makes
 * exactly the calls it names. The client talks to the mock server through a real HttpClient.
 */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(ProjectsStore);
}

describe('qits-landing-app → qits-projects-service pact', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sign-in-landing: a visitor whose list call is answered has a session', () =>
    given('sign-in-landing', 'a project exists', 'listProjects').executeTest(async (server) => {
      expect(await storeAt(server.url).hasSession()).toBe(true);
    }));

  it('list-projects: the store loads the list', () =>
    given('list-projects', 'a project exists', 'listProjects').executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      const recorded = masters.body('a project exists', 'listProjects').entries[0].project;
      expect(store.status()).toBe('loaded');
      expect(store.ids()).toContain(recorded.id);
    }));

  it('open-project: the store fetches a project it does not hold', () =>
    given('open-project', 'a project exists', 'getProject').executeTest(async (server) => {
      const store = storeAt(server.url);
      const id = masters.operation('a project exists', 'getProject').params['projectId'];
      await store.refresh(id);
      const recorded = masters.body('a project exists', 'getProject').project;
      expect(store.selected()?.id).toBe(id);
      expect(store.selected()?.name).toBe(recorded.name);
    }));

  it('open-project: a project qits-projects does not know stays selected and unloaded', () =>
    given('open-project', 'no project with the given id', 'getProject').executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const id = masters.operation('no project with the given id', 'getProject').params[
          'projectId'
        ];
        await store.refresh(id);
        expect(store.selectedId()).toBe(id);
        expect(store.selected()).toBeUndefined();
        expect(store.ids()).toEqual([]);
      },
    ));

  it('show-project-repositories: the store loads a project’s repositories', () =>
    given(
      'show-project-repositories',
      'a project with 3 repositories',
      'listProjectRepositories',
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation('a project with 3 repositories', 'listProjectRepositories');
      const projectId = op.params['projectId'];
      await store.loadRepositories(projectId);
      const loaded = store.repositories()[projectId];
      expect(loaded?.status).toBe('loaded');
      // `arrayContaining` puts one example per element shape on the wire, not the recorded count.
      expect(loaded?.entries.length).toBeGreaterThan(0);
    }));
});
