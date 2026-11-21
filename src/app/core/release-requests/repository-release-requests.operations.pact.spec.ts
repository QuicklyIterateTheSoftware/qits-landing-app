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
import { filterRequests } from './repository-release-requests';
import { REPOSITORY_RELEASE_REQUESTS } from './repository-release-requests.operations';

/**
 * The repository release requests' part of qits-landing-app's pact with qits-projects-service
 * (qits-2506): `show-repository-release-requests` reads one repository's requests
 * (`REPOSITORY_RELEASE_REQUESTS`) with `state=all` in "a repository with a release not merged to
 * main" (one withdrawn, one released, one finalized; the page narrows it for its released and
 * closed filters), and with no state (the open ones) in "a frozen release request with
 * a queued next request".
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = ['listRepositoryReleaseRequests'];

const ALL = 'a repository with a release not merged to main';
const OPEN = 'a frozen release request with a queued next request';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-repository-release-requests-pact-'));
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

const given = (state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: REPOSITORY_RELEASE_REQUESTS.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-repository-release-requests' },
    consumes: REPOSITORY_RELEASE_REQUESTS.consumes,
  });

/** The recorded call of `state`: its repository and its query. */
const callOf = (state: string) => {
  const op = masters.operation(state, 'listRepositoryReleaseRequests');
  const repoId = op.params['repositoryId'] ?? op.params['repoId'];
  const query = (op as { query?: Record<string, string> }).query;
  return query?.['state']
    ? { path: { repoId }, query: { state: query['state'] } }
    : { path: { repoId } };
};

describe('qits-landing-app → qits-projects-service pact: a repository’s release requests', () => {
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
    expect(REPOSITORY_RELEASE_REQUESTS.provider).toBe(PROVIDER);
  });

  it('show-repository-release-requests: the whole history, released and withdrawn', () =>
    given(ALL).executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        REPOSITORY_RELEASE_REQUESTS.fetch(callOf(ALL)),
      );
      expect(error).toBeUndefined();
      const requests = data?.requests ?? [];
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every((request) => !!request.qualifiedId && !!request.state)).toBe(true);
    }));

  it('show-repository-release-requests: the open ones', () =>
    given(OPEN).executeTest(async (server) => {
      const { data } = await at(server.url, () => REPOSITORY_RELEASE_REQUESTS.fetch(callOf(OPEN)));
      const requests = data?.requests ?? [];
      expect(filterRequests(requests, 'open').length).toBe(requests.length);
    }));
});
