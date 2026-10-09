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
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  GET_FILE_DIFF,
  GET_SUBMODULE_CHANGES,
  LIST_COMMIT_CHANGES,
  LIST_RELEASE_REQUEST_CHANGES,
} from './changes.consumes';
import { ChangesStore } from './changes.store';

/**
 * `ChangesStore`'s part of qits-landing-app's pact with qits-projects-service, in
 * `pacts/qits-landing-app_qits-projects-service.json` (see `projects.store.pact.spec.ts`).
 *
 * TODO(qits-112): skipped until qits-projects-service releases the provider states for a release
 * request's changes (`external/rr-detail-states`) and for a commit's changes
 * (`external/rr-commit-states`) in `@qits/projects-golden-masters`. Then pin that version, set the
 * state names and operationIds below to the recorded ones, and drop the skip.
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
    consumes,
  });

function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(ChangesStore);
}

/** Waits until the read under `key` has an answer. */
async function answered(store: InstanceType<typeof ChangesStore>, key: string) {
  for (let i = 0; i < 100 && store.read(key)?.status === 'loading'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return store.read(key);
}

describe.skip('qits-landing-app → qits-projects-service pact: changes', () => {
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
    given(
      'show-release-request-changes',
      STATES.fold,
      'listReleaseRequestChanges',
      LIST_RELEASE_REQUEST_CHANGES,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { params } = masters.operation(STATES.fold, 'listReleaseRequestChanges');
      const key = store.releaseChanges(params['repoId'], params['requestId'], 'fold');
      expect((await answered(store, key))?.status).toBe('loaded');
    }));

  it('show-release-request-changes: one file’s patch', () =>
    given(
      'show-release-request-changes',
      STATES.fold,
      'getReleaseRequestChangeDiff',
      GET_FILE_DIFF,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { params, query } = masters.operation(STATES.fold, 'getReleaseRequestChangeDiff');
      const key = store.releaseFileDiff(
        params['repoId'],
        params['requestId'],
        'fold',
        query['path'],
      );
      expect((await answered(store, key))?.status).toBe('loaded');
    }));

  it('show-release-request-changes: a submodule pin, expanded', () =>
    given(
      'show-release-request-changes',
      STATES.wrapper,
      'getReleaseRequestSubmoduleChanges',
      GET_SUBMODULE_CHANGES,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { params, query } = masters.operation(
        STATES.wrapper,
        'getReleaseRequestSubmoduleChanges',
      );
      const key = store.submoduleChanges(
        params['repoId'],
        params['requestId'],
        'fold',
        query['path'],
      );
      expect((await answered(store, key))?.status).toBe('loaded');
    }));

  it('show-release-request-changes: a file inside a submodule', () =>
    given(
      'show-release-request-changes',
      STATES.wrapper,
      'getReleaseRequestSubmoduleChangeDiff',
      GET_FILE_DIFF,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { params, query } = masters.operation(
        STATES.wrapper,
        'getReleaseRequestSubmoduleChangeDiff',
      );
      const key = store.submoduleFileDiff(
        params['repoId'],
        params['requestId'],
        'fold',
        query['path'],
        query['file'],
      );
      expect((await answered(store, key))?.status).toBe('loaded');
    }));

  it('show-commit-changes: a commit’s files', () =>
    given(
      'show-commit-changes',
      STATES.commit,
      'listCommitChanges',
      LIST_COMMIT_CHANGES,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { params } = masters.operation(STATES.commit, 'listCommitChanges');
      const key = store.commitChanges(params['repoId'], params['commitHash']);
      expect((await answered(store, key))?.status).toBe('loaded');
    }));

  it('show-commit-changes: one file’s patch in a commit', () =>
    given('show-commit-changes', STATES.commit, 'getCommitFileDiff', GET_FILE_DIFF).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const { params, query } = masters.operation(STATES.commit, 'getCommitFileDiff');
        const key = store.commitFileDiff(params['repoId'], params['commitHash'], query['path']);
        expect((await answered(store, key))?.status).toBe('loaded');
      },
    ));
});
