import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NOTHING, type QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { BACKUP_SYNC, LIST_PROJECT_WRAPPER, PROJECT_REPOSITORIES } from './repositories.operations';

/**
 * The repository operations' part of qits-landing-app's pact with qits-projects-service
 * (`repositories.operations.ts`, qits-2143, qits-2146), in
 * `pacts/qits-landing-app_qits-projects-service.json` beside `ProjectsStore`'s, `WorkStore`'s and
 * the other operations' parts (see `src/testing/pact-part.ts`):
 *
 * - `show-project-workspaces` (`LIST_PROJECT_WRAPPER`): the Agents page's read of the wrapper and
 *   its main branch;
 * - `show-project-repositories` (`LIST_PROJECT_WRAPPER`): a project card's count. It bound the
 *   entries' ids alone while `RepositoriesStore` read the card's list; the card's own read binds
 *   what `LIST_PROJECT_WRAPPER` consumes, the wrapper and its main branch too, which its
 *   `refreshOn` narrows by (`movesWrapper`), as the store's `follow` did over its whole list;
 * - `show-project-repositories-tree` (`PROJECT_REPOSITORIES`): the Repositories page's tree, the
 *   whole list (the UI builder and the release request page's `RepositoriesStore` read the same);
 * - `sync-backups-after-sign-in` (`BACKUP_SYNC`): the nudge after the backup sign-in, and a
 *   project qits-projects does not know (a 404, binding the status only).
 *
 * The last three moved here from `repositories.store.pact.spec.ts`: the same descriptions, states
 * and requests, and the same bound fields but the card's. Each interaction comes from the operation itself
 * (`OP.operationId`, `OP.consumes`; `OP.provider` held to the spec's literal provider), and each
 * test runs the operation's own `fetch` against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = ['listProjectRepositories', 'backupSyncProject'];

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

/**
 * The interaction for `op` in `state`, triggered by `interaction`, binding `op.consumes` (or
 * `consumes`, for an error answer). `op` must be `PROVIDER`'s.
 */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
  consumes: readonly string[] = op.consumes,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
  });
};

const projectOf = (state: string, operationId = 'listProjectRepositories') =>
  masters.operation(state, operationId).params['projectId'];

describe('qits-landing-app → qits-projects-service pact: the repository operations', () => {
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

  it('declares the provider this spec binds', () => {
    for (const op of [LIST_PROJECT_WRAPPER, PROJECT_REPOSITORIES]) {
      expect(op.provider).toBe(PROVIDER);
    }
    expect(BACKUP_SYNC.provider).toBe(PROVIDER);
  });

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

  it('show-project-repositories: the store loads a project’s repositories for its card', () =>
    given(
      LIST_PROJECT_WRAPPER,
      'a project with 3 repositories',
      'show-project-repositories',
    ).executeTest(async (server) => {
      const state = 'a project with 3 repositories';
      const { data } = await at(server.url, () =>
        LIST_PROJECT_WRAPPER.fetch({ path: { projectId: projectOf(state) } }),
      );
      const recorded = masters.body(state, 'listProjectRepositories');
      expect(data?.entries?.length).toBe(recorded.entries.length);
    }));

  it.each(['two projects exist', 'a project with one repository'])(
    'show-project-repositories: the store loads the repositories for a card in %s',
    (state) =>
      given(LIST_PROJECT_WRAPPER, state, 'show-project-repositories').executeTest(
        async (server) => {
          const { data } = await at(server.url, () =>
            LIST_PROJECT_WRAPPER.fetch({ path: { projectId: projectOf(state) } }),
          );
          const recorded = masters.body(state, 'listProjectRepositories');
          expect(data?.entries?.length).toBe(recorded.entries.length);
        },
      ),
  );

  it('show-project-repositories-tree: the store loads the repositories and the wrapper view', () =>
    given(PROJECT_REPOSITORIES, STATE, 'show-project-repositories-tree').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          PROJECT_REPOSITORIES.fetch({ path: { projectId: projectOf(STATE) } }),
        );
        expect(data?.entries?.length).toBeGreaterThan(0);
        expect(data?.wrapper?.entries?.length).toBeGreaterThan(0);
      },
    ));

  it('sync-backups-after-sign-in: the store schedules every repository’s backup', () =>
    given(BACKUP_SYNC, STATE, 'sync-backups-after-sign-in').executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        BACKUP_SYNC.fetch({ path: { projectId: projectOf(STATE, 'backupSyncProject') } }),
      );
      expect(data?.scheduled).toBe(masters.body(STATE, 'backupSyncProject').scheduled);
    }));

  it('sync-backups-after-sign-in: a project qits-projects does not know schedules nothing', () =>
    // On an error the page reads nothing from the body: the operation's default `errorConsumes`.
    given(
      BACKUP_SYNC,
      'no project with the given id',
      'sync-backups-after-sign-in',
      NOTHING,
    ).executeTest(async (server) => {
      const state = 'no project with the given id';
      const { data, response } = await at(server.url, () =>
        BACKUP_SYNC.fetch({ path: { projectId: projectOf(state, 'backupSyncProject') } }),
      );
      expect(data).toBeUndefined();
      expect(response?.status).toBe(404);
    }));
});
