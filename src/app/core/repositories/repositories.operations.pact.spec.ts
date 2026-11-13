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
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { LIST_PROJECT_WRAPPER } from './repositories.operations';

/**
 * The Agents page's part of qits-landing-app's pact with qits-projects-service (qits-2143): its
 * own read of the project's repositories (`LIST_PROJECT_WRAPPER`), in
 * `pacts/qits-landing-app_qits-projects-service.json` beside `RepositoriesStore`'s and
 * `ProjectsStore`'s parts (see `src/testing/pact-part.ts`).
 *
 * "a project with repositories in components", the state the page's screenshots show: the
 * wrapper names its repository, whose entry carries its main branch. The interaction comes from the
 * operation itself (`OP.operationId`, `OP.consumes`, binding only `PROJECT_WRAPPER`; `OP.provider`
 * held to the spec's literal provider), and the test runs the operation's own `fetch` against the
 * mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  { operationId: 'listProjectRepositories', interactions: ['show-project-workspaces'] },
];

const STATE = 'a project with repositories in components';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-repositories-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-projects-service pact: the Agents page’s operations', () => {
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

  it('declares the provider this spec binds', () =>
    expect(LIST_PROJECT_WRAPPER.provider).toBe(PROVIDER));

  it('show-project-workspaces: the project’s repositories, for its wrapper and its main branch', () =>
    // The provider as the literal `qits/pact-names` can check; the test above holds the operation to it.
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: LIST_PROJECT_WRAPPER.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-project-workspaces' },
      consumes: LIST_PROJECT_WRAPPER.consumes,
    }).executeTest(async (server) => {
      const projectId = masters.operation(STATE, 'listProjectRepositories').params['projectId'];
      const { data } = await at(server.url, () =>
        LIST_PROJECT_WRAPPER.fetch({ path: { projectId } }),
      );
      expect(data?.wrapper?.repositoryId).toBeTruthy();
      // The pact binds each entry by type (the mock answers its examples), so it holds that every
      // entry names its main branch, not which entry is the wrapper's.
      const entries = data?.entries ?? [];
      expect(entries.length).toBeGreaterThan(0);
      expect(
        entries.every((entry) => !!entry.repository?.id && !!entry.repository.mainBranch),
      ).toBe(true);
    }));
});
