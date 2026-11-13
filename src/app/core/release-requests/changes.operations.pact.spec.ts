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
import {
  COMMIT_CHANGES,
  COMMIT_FILE_DIFF,
  RELEASE_CHANGES,
  RELEASE_FILE_DIFF,
  SUBMODULE_CHANGES,
  SUBMODULE_FILE_DIFF,
} from './changes.operations';

/**
 * The change operations' part of qits-landing-app's pact with qits-projects-service
 * (`changes.operations.ts`), in `pacts/qits-landing-app_qits-projects-service.json` beside the
 * other parts: the Changes tab's list, a file's patch, a moved pin and a file inside it, and a
 * commit's files and one file's patch.
 *
 * Moved here from `ChangesStore`'s pact spec when the store went (qits-2146), unchanged: the same
 * descriptions, states, requests and bound fields. Each test runs the operation's own `fetch`
 * against a pact mock server answering with qits-projects' golden master; each interaction's
 * `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const STATES = {
  fold: 'a release request awaiting approval',
  wrapper: 'a release request awaiting approval',
  commit: 'a released release request',
} as const;

const OPERATIONS = [
  'listReleaseRequestChanges',
  'getReleaseRequestChangeDiff',
  'getReleaseRequestSubmoduleChanges',
  'getReleaseRequestSubmoduleChangeDiff',
  'listCommitChanges',
  'getCommitFileDiff',
];

let dir = '';
let pact: PactV4;

/** What an interaction takes of an operation: its provider, operationId and `consumes`. */
interface Bound {
  readonly provider: string;
  readonly operationId: string;
  readonly consumes: readonly string[];
}

const given = (slug: InteractionSlug, state: string, op: Bound) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is not ${PROVIDER}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    // A field under a recorded `null` (a file that is no submodule pin) is bound where it is set.
    consumes: heldBy(masters, state, op.operationId, op.consumes),
  });
};

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
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

/** The commit a recorded commit path names: the recording writes its sha into the path. */
const commitOf = (path: string) => /\/commits\/([0-9a-f]{40})\//.exec(path)![1];

describe('qits-landing-app → qits-projects-service pact: changes', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
    pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
  });

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

  it('show-release-request-changes: the Changes tab lists the fold’s files', () =>
    given('show-release-request-changes', STATES.fold, RELEASE_CHANGES).executeTest(
      async (server) => {
        const { params } = masters.operation(STATES.fold, 'listReleaseRequestChanges');
        const { error, data } = await at(server.url, () =>
          RELEASE_CHANGES.fetch({
            path: { repoId: params['repositoryId'], requestId: params['requestId'] },
          }),
        );
        expect(error).toBeUndefined();
        expect(Array.isArray(data?.files)).toBe(true);
      },
    ));

  it('show-release-request-changes: one file’s patch', () =>
    given('show-release-request-changes', STATES.fold, RELEASE_FILE_DIFF).executeTest(
      async (server) => {
        const { params, query } = masters.operation(STATES.fold, 'getReleaseRequestChangeDiff');
        const { error, data } = await at(server.url, () =>
          RELEASE_FILE_DIFF.fetch({
            path: { repoId: params['repositoryId'], requestId: params['requestId'] },
            query: { path: query['path'] },
          }),
        );
        expect(error).toBeUndefined();
        expect(data).toBeTruthy();
      },
    ));

  it('show-release-request-changes: a submodule pin, expanded', () =>
    given('show-release-request-changes', STATES.wrapper, SUBMODULE_CHANGES).executeTest(
      async (server) => {
        const { params, query } = masters.operation(
          STATES.wrapper,
          'getReleaseRequestSubmoduleChanges',
        );
        const { error, data } = await at(server.url, () =>
          SUBMODULE_CHANGES.fetch({
            path: { repoId: params['repositoryId'], requestId: params['requestId'] },
            query: { path: query['path'] },
          }),
        );
        expect(error).toBeUndefined();
        expect(data).toBeTruthy();
      },
    ));

  it('show-release-request-changes: a file inside a submodule', () =>
    given('show-release-request-changes', STATES.wrapper, SUBMODULE_FILE_DIFF).executeTest(
      async (server) => {
        const { params, query } = masters.operation(
          STATES.wrapper,
          'getReleaseRequestSubmoduleChangeDiff',
        );
        const { error, data } = await at(server.url, () =>
          SUBMODULE_FILE_DIFF.fetch({
            path: { repoId: params['repositoryId'], requestId: params['requestId'] },
            query: { path: query['path'], file: query['file'] },
          }),
        );
        expect(error).toBeUndefined();
        expect(data).toBeTruthy();
      },
    ));

  it('show-commit-changes: a commit’s files', () =>
    given('show-commit-changes', STATES.commit, COMMIT_CHANGES).executeTest(async (server) => {
      const { params, path } = masters.operation(STATES.commit, 'listCommitChanges');
      const { error, data } = await at(server.url, () =>
        COMMIT_CHANGES.fetch({
          path: { repoId: params['repositoryId'], commitHash: commitOf(path) },
        }),
      );
      expect(error).toBeUndefined();
      expect(Array.isArray(data?.files)).toBe(true);
    }));

  it('show-commit-changes: one file’s patch in a commit', () =>
    given('show-commit-changes', STATES.commit, COMMIT_FILE_DIFF).executeTest(async (server) => {
      const { params, path, query } = masters.operation(STATES.commit, 'getCommitFileDiff');
      const { error, data } = await at(server.url, () =>
        COMMIT_FILE_DIFF.fetch({
          path: { repoId: params['repositoryId'], commitHash: commitOf(path) },
          query: { path: query['path'] },
        }),
      );
      expect(error).toBeUndefined();
      expect(data).toBeTruthy();
    }));
});
