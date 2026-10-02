import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { LIST_PROJECT_REPOSITORIES, PROJECT_CARD_REPOSITORIES } from './repositories.consumes';
import { RepositoriesStore } from './repositories.store';

/**
 * `RepositoriesStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-112):
 * the `listProjectRepositories` interactions, in the same file as `ProjectsStore`'s
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * Each test drives `load(projectId)`, as the UI interaction named in `interactions.ts` does, against
 * a pact mock server answering with qits-projects' golden master, binding only the fields in
 * `repositories.consumes.ts`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listProjectRepositories'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-repositories-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** The interaction for `state`, triggered by `slug`, binding `consumes` (the page's whole list
 * by default; the card's interaction binds only what the card relies on). */
const given = (
  slug: InteractionSlug,
  state: string,
  consumes: readonly string[] = LIST_PROJECT_REPOSITORIES,
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'listProjectRepositories',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes,
  });

/** A store whose client talks to the mock server through a real HttpClient. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(RepositoriesStore);
}

const projectOf = (state: string) =>
  masters.operation(state, 'listProjectRepositories').params['projectId'];

describe('qits-landing-app → qits-projects-service pact: repositories', () => {
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

  it('show-project-repositories: the store loads a project’s repositories for its card', () =>
    given(
      'show-project-repositories',
      'a project with 3 repositories',
      PROJECT_CARD_REPOSITORIES,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf('a project with 3 repositories');
      await store.load(projectId);
      const loaded = store.byProject()[projectId];
      expect(loaded?.status).toBe('loaded');
      const recorded = masters.body('a project with 3 repositories', 'listProjectRepositories');
      expect(loaded?.entries.length).toBe(recorded.entries.length);
    }));

  it('show-project-repositories-tree: the store loads the repositories and the wrapper view', () =>
    given(
      'show-project-repositories-tree',
      'a project with repositories in components',
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf('a project with repositories in components');
      await store.load(projectId);
      const loaded = store.byProject()[projectId];
      expect(loaded?.status).toBe('loaded');
      expect(loaded?.wrapper?.entries?.length).toBeGreaterThan(0);
    }));
});
