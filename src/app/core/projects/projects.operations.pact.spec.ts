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
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { bindable, openEndedReleaseRequests } from '../../../testing/release-requests-pact';
import { isPendingRelease } from './projects.consumes';
import { PROJECT_DETAIL, PROJECT_LIST, PROJECT_RELEASE_REQUESTS } from './projects.operations';

/**
 * The project operations' part of qits-landing-app's pact with qits-projects-service
 * (`projects.operations.ts`, qits-2146), in `pacts/qits-landing-app_qits-projects-service.json`
 * beside `ProjectsStore`'s, `WorkStore`'s and the repository and work operations'
 * parts (see `src/testing/pact-part.ts`):
 *
 * - `list-projects` (`PROJECT_LIST`): the picker's and `SelectedProject`'s list, of one, two and no
 *   projects;
 * - `open-project` (`PROJECT_DETAIL`): a project's page reading its project, and a project
 *   qits-projects does not know (a 404, binding the status only);
 * - `open-release-requests` (`PROJECT_RELEASE_REQUESTS`): the open project's release requests, in
 *   every state and none, as `ProjectReleaseRequests` reads them (the lightning menu, still on
 *   `ProjectsStore`, makes the same request).
 *
 * Moved here from `projects.store.pact.spec.ts`, unchanged: the same descriptions, states,
 * requests and bound fields (each through `heldBy`, and the release requests opened up by
 * `openEndedReleaseRequests`, as there). Each interaction comes from the operation itself
 * (`OP.operationId`, `OP.consumes`; `OP.provider` checked against the spec's literal provider), and
 * each test runs the operation's own `fetch` against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  'listProjects',
  'getProject',
  { operationId: 'listProjectReleaseRequests', interactions: ['open-release-requests'] },
];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-projects-operations-pact-'));
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
 * `consumes`, for an error answer) as far as the state holds it. `op` must be `PROVIDER`'s.
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
    // A field under a recorded `null` (no conflict) is bound in a state that has it.
    consumes: heldBy(masters, state, op.operationId, bindable(consumes)),
  });
};

/** `state`'s param `name` for `operationId`, as the golden masters froze it. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

describe('qits-landing-app → qits-projects-service pact: the project operations', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
    try {
      const generated = join(dir, `${CONSUMER}-${PROVIDER}.json`);
      openEndedReleaseRequests(generated);
      assertPactPart(generated, COMMITTED, OPERATIONS, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('list-projects: the list', () =>
    given(PROJECT_LIST, 'a project exists', 'list-projects').executeTest(async (server) => {
      const { data } = await at(server.url, () => PROJECT_LIST.fetch({}));
      const recorded = masters.body('a project exists', 'listProjects').entries[0].project;
      expect(data?.entries?.map((entry) => entry.project?.id)).toContain(recorded.id);
    }));

  it('list-projects: a list of two projects', () =>
    given(PROJECT_LIST, 'two projects exist', 'list-projects').executeTest(async (server) => {
      const { data } = await at(server.url, () => PROJECT_LIST.fetch({}));
      // The pact binds the entries by type, so the mock answers with the first recorded one.
      const recorded = masters.body('two projects exist', 'listProjects').entries[0].project;
      expect(data?.entries?.map((entry) => entry.project?.id)).toContain(recorded.id);
    }));

  it('list-projects: an empty list', () =>
    given(PROJECT_LIST, 'no projects exist', 'list-projects').executeTest(async (server) => {
      const { data } = await at(server.url, () => PROJECT_LIST.fetch({}));
      expect(data?.entries).toEqual([]);
    }));

  it('open-project: a project by its id', () =>
    given(PROJECT_DETAIL, 'a project exists', 'open-project').executeTest(async (server) => {
      const id = param('a project exists', 'getProject', 'projectId');
      const { data } = await at(server.url, () => PROJECT_DETAIL.fetch({ path: { id } }));
      const recorded = masters.body('a project exists', 'getProject').project;
      expect(data?.project?.id).toBe(id);
      expect(data?.project?.name).toBe(recorded.name);
    }));

  it('open-project: a project qits-projects does not know', () =>
    // On an error the operation reads nothing from the body: its `errorConsumes` is empty.
    given(PROJECT_DETAIL, 'no project with the given id', 'open-project', NOTHING).executeTest(
      async (server) => {
        const id = param('no project with the given id', 'getProject', 'projectId');
        const { data, response } = await at(server.url, () =>
          PROJECT_DETAIL.fetch({ path: { id } }),
        );
        expect(data).toBeUndefined();
        expect(response?.status).toBe(404);
      },
    ));

  it('open-release-requests: a project’s release requests, in every state', () =>
    given(
      PROJECT_RELEASE_REQUESTS,
      'a project with release requests in every state',
      'open-release-requests',
    ).executeTest(async (server) => {
      const projectId = param(
        'a project with release requests in every state',
        'listProjectReleaseRequests',
        'projectId',
      );
      const { data } = await at(server.url, () =>
        PROJECT_RELEASE_REQUESTS.fetch({ path: { projectId } }),
      );
      // The mock answers with every recorded request (one `arrayContaining` example per shape); the
      // committed pact is then cut to one representative (`openEndedReleaseRequests`). Which
      // states are pending is the plain spec's business.
      const pending = (data?.requests ?? []).filter(isPendingRelease);
      expect(pending.some((request) => request.automations?.length)).toBe(true);
    }));

  it('open-release-requests: a project without any lists none', () =>
    given(
      PROJECT_RELEASE_REQUESTS,
      'a project with no release requests',
      'open-release-requests',
    ).executeTest(async (server) => {
      const projectId = param(
        'a project with no release requests',
        'listProjectReleaseRequests',
        'projectId',
      );
      const { data } = await at(server.url, () =>
        PROJECT_RELEASE_REQUESTS.fetch({ path: { projectId } }),
      );
      expect(data?.requests).toEqual([]);
    }));
});
