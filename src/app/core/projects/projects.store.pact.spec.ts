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
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { bindable, openEndedReleaseRequests } from '../../../testing/release-requests-pact';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { LIST_PROJECT_RELEASE_REQUESTS } from './projects.consumes';
import { ProjectsStore } from './projects.store';

/**
 * qits-landing-app's pact with qits-projects-service (epic qits-546). Both sides are named by
 * repository, so the file is `pacts/qits-landing-app_qits-projects-service.json`.
 *
 * This spec covers what is left of `ProjectsStore` (the release request pages' reads),
 * `projects.operations.pact.spec.ts` the project operations (qits-2146), `work.store.pact.spec.ts`
 * `WorkStore` and `repositories.operations.pact.spec.ts` the repository operations, in the same pact
 * file.
 * Each test
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
 * What this spec owns in that file: the release request page's `listProjectReleaseRequests`
 * interactions. The operations' pact spec (`projects.operations.pact.spec.ts`, qits-2146) owns
 * `listProjects`, `getProject` and the lightning menu's `open-release-requests` interactions,
 * `WorkStore`'s and `work.operations.pact.spec.ts` `listProjectWork`, and the repository operations'
 * `listProjectRepositories` and `backupSyncProject`, in
 * the same file (`src/testing/pact-part.ts`).
 */
const OPERATIONS: readonly OwnedOperation[] = [
  { operationId: 'listProjectReleaseRequests', interactions: ['show-project-release-requests'] },
];

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
    consumes: heldBy(masters, state, operationId, bindable(consumes)),
  });

/**
 * A store on a server platform: each test makes exactly the calls it names. The client talks to the
 * mock server through a real HttpClient.
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
      const generated = join(dir, `${CONSUMER}-${PROVIDER}.json`);
      openEndedReleaseRequests(generated);
      assertPactPart(generated, COMMITTED, OPERATIONS, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  // Epic qits-1580, the soft feature freeze: a request frozen at its threshold and the one queued
  // behind it, so the list's freeze and queue fields are bound in a state that sets them. Like the
  // other list answers, the committed pact keeps one representative (`openEndedReleaseRequests`).
  it('show-project-release-requests: a frozen request and the one queued behind it', () =>
    given(
      'show-project-release-requests',
      'a frozen release request with a queued next request',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a frozen release request with a queued next request',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      const requests = store.releaseRequests()[projectId]?.requests ?? [];
      const frozen = requests.find((request) => request.id === op.params['requestId']);
      const queued = requests.find((request) => request.id === op.params['queuedRequestId']);
      expect(frozen?.featureFreeze?.frozen).toBe(true);
      expect(frozen?.queuedNext).toBe(queued?.id);
      expect(queued?.queuedBehind).toBe(frozen?.id);
      expect(queued?.queuedBehindQualifiedId).toBe(frozen?.qualifiedId);
    }));

  // An obsolete request's successor, carrying a work item (qits-2039): the page links it (epic
  // qits-2000). An item's work item is read unbound (UNBOUND_RELEASE_REQUESTS), so the mock server
  // does not answer it; the page's spec shows it from the recording.
  it('show-project-release-requests: a request whose item names a work item', () =>
    given(
      'show-project-release-requests',
      'a repository with a tagged release whose request went obsolete mid-publish',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a repository with a tagged release whose request went obsolete mid-publish',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      const kept = store.releaseRequests()[projectId];
      expect(kept?.status).toBe('loaded');
      expect(kept?.requests.some((request) => request.items?.length)).toBe(true);
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
});
