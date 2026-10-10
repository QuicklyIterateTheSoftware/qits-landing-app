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
import { addGoldenInteraction } from '@qits/angular/testing';
import { assertPactPart } from '../../../testing/pact-part';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { NOTHING } from '@qits/angular';
import {
  GET_PROJECT,
  LIST_PROJECT_RELEASE_REQUESTS,
  LIST_PROJECTS,
  SESSION_CHECK,
} from './projects.consumes';
import { ProjectsStore } from './projects.store';

/**
 * qits-landing-app's pact with qits-projects-service (epic qits-546). Both sides are named by
 * repository, so the file is `pacts/qits-landing-app_qits-projects-service.json`.
 *
 * The stores are the only users of the qits-projects client; this spec covers `ProjectsStore`,
 * `work.store.pact.spec.ts` covers `WorkStore` and `repositories.store.pact.spec.ts` covers
 * `RepositoriesStore`, in the same pact file. Each test
 * drives one store method, as the UI interaction named in `interactions.ts` does, against a pact
 * mock server that answers with qits-projects' golden master, and checks what the store made of it.
 * Each interaction binds only the fields the store reads: the same list from `projects.consumes.ts`
 * that the store passes to `consume(...)`.
 *
 * The run writes the pact to a fresh directory (pact-js names it `<consumer>-<provider>.json`);
 * `afterAll` compares it with the committed file and fails on a difference
 * (`QITS_GOLDEN_UPDATE=true npm test` rewrites it). A fresh directory, because pact-js merges into
 * an existing file and would keep an interaction no test makes anymore.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/**
 * The operations this spec owns in that file. `WorkStore`'s pact spec owns `listProjectWork`
 * and `RepositoriesStore`'s owns `listProjectRepositories`, in the same file
 * (`src/testing/pact-part.ts`).
 */
const OPERATIONS = ['listProjects', 'getProject', 'listProjectReleaseRequests'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/**
 * Adds the interaction for (state, operation), triggered by the UI interaction `slug`, binding the
 * body paths in `consumes`.
 */
const given = (
  slug: InteractionSlug,
  state: string,
  operationId: string,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    // A field under a recorded `null` (no conflict) is bound in a state that has it.
    consumes: heldBy(masters, state, operationId, consumes),
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

  it('sign-in-landing: a visitor whose list call is answered has a session', () =>
    given('sign-in-landing', 'a project exists', 'listProjects', SESSION_CHECK).executeTest(
      async (server) => {
        expect(await storeAt(server.url).hasSession()).toBe(true);
      },
    ));

  it('list-projects: the store loads the list', () =>
    given('list-projects', 'a project exists', 'listProjects', LIST_PROJECTS).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        await store.load();
        const recorded = masters.body('a project exists', 'listProjects').entries[0].project;
        expect(store.status()).toBe('loaded');
        expect(store.ids()).toContain(recorded.id);
      },
    ));

  it('open-project: the store fetches a project it does not hold', () =>
    given('open-project', 'a project exists', 'getProject', GET_PROJECT).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const id = masters.operation('a project exists', 'getProject').params['projectId'];
        await store.refresh(id);
        const recorded = masters.body('a project exists', 'getProject').project;
        expect(store.selected()?.id).toBe(id);
        expect(store.selected()?.name).toBe(recorded.name);
      },
    ));

  it('open-project: a project qits-projects does not know stays selected and unloaded', () =>
    // On an error the store reads nothing from the body: `consume`'s default for `error`.
    given('open-project', 'no project with the given id', 'getProject', NOTHING).executeTest(
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

  it('open-release-requests: the store loads a project’s pending release requests', () =>
    given(
      'open-release-requests',
      'a project with pending release requests',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with pending release requests',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      // The pact binds the fields by type, so the mock repeats the recorded example; which states
      // are pending is the plain spec's business.
      expect(store.releaseRequests()[projectId]?.status).toBe('loaded');
    }));

  it('show-project-release-requests: the page reads every request, with its details', () =>
    given(
      'show-project-release-requests',
      'a project with pending release requests',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with pending release requests',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      const kept = store.releaseRequests()[projectId];
      expect(kept?.status).toBe('loaded');
      expect(kept?.requests.length).toBeGreaterThan(0);
      expect(kept?.requests.every((r) => typeof r.updatedAt === 'string')).toBe(true);
    }));

  it('show-release-request: a request’s page finds its repository among requests in every state', () =>
    given(
      'show-release-request',
      'a project with release requests in every state',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with release requests in every state',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      const kept = store.releaseRequests()[projectId];
      expect(kept?.requests.find((r) => r.id === op.params['requestId'])?.repoId).toBe(
        op.params['repositoryId'],
      );
    }));

  it('show-project-release-requests: a project without any shows none', () =>
    given(
      'show-project-release-requests',
      'a project with no release requests',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with no release requests',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      expect(store.releaseRequests()[projectId]?.requests).toEqual([]);
    }));

  it('open-release-requests: a project without any lists none', () =>
    given(
      'open-release-requests',
      'a project with no release requests',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with no release requests',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      expect(store.releaseRequests()[projectId]).toEqual({
        status: 'loaded',
        requests: [],
        pending: [],
      });
    }));
});
