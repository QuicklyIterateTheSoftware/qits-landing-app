import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as githostClient } from '../../api/githost/client.gen';
import { provideHeyApiClient } from '../../api/githost/client/client.gen';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { githostGoldenMasters as masters } from '../../../testing/golden-masters';
import { LIST_LOC } from './loc.consumes';
import { LocStore } from './loc.store';

/**
 * qits-landing-app's pact with qits-githost-service (epic qits-112), in
 * `pacts/qits-githost-service/qits-landing-app_qits-githost-service.json`.
 *
 * The store is the only user of the qits-githost client, so this file is the whole pact. It has one
 * interaction per kind of list the cards meet, each from its own provider state: every repository
 * counted, one not counted yet, one without a commit, and a list mixing counted and not counted.
 * Each binds only `LIST_LOC`, the list the store passes to `consume(...)`. See
 * `projects.store.pact.spec.ts` for how the file is written and compared.
 *
 * The mock server answers from the matchers' examples (a language list is its first recorded
 * language, repeated), not the recorded body itself, so these tests check what kind of total the
 * store makes; `loc.store.spec.ts` checks the exact sums against the recorded bodies.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-githost-service';
const COMMITTED = resolve(process.cwd(), `pacts/${PROVIDER}/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'listLoc',
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-project-loc' },
    consumes: LIST_LOC,
  });

/** The state's frozen repository id(s), by param name. */
const param = (state: string, name: string) => masters.operation(state, 'listLoc').params[name];

/** A store on a server platform, so it neither loads by itself nor asks again later. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(githostClient),
    ],
  });
  githostClient.setConfig({ baseUrl: url });
  return TestBed.inject(LocStore);
}

describe('qits-landing-app → qits-githost-service pact', () => {
  afterAll(() => {
    githostClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-project-loc: a counted repository adds its lines', () =>
    given('a repository with counted lines').executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      const totals = store.totals([param('a repository with counted lines', 'repositoryId')]);
      expect(totals?.partial).toBe(false);
      expect(totals?.main).toBeGreaterThan(0);
      expect(totals?.test).toBeGreaterThan(0);
      expect(totals?.languages.length).toBeGreaterThan(0);
      expect(totals?.languages.every((l) => l.language.length > 0)).toBe(true);
    }));

  it('show-project-loc: a repository not counted yet makes the total partial', () =>
    given('a repository not counted yet').executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      const id = param('a repository not counted yet', 'repositoryId');
      expect(store.totals([id])).toEqual({ main: 0, test: 0, partial: true, languages: [] });
    }));

  it('show-project-loc: a repository without a commit adds nothing', () =>
    given('a repository with no commit').executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      const id = param('a repository with no commit', 'repositoryId');
      expect(store.totals([id])).toEqual({ main: 0, test: 0, partial: false, languages: [] });
    }));

  it('show-project-loc: a list mixing counted and not counted gives a partial sum', () =>
    given('two repositories, one counted').executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      const counted = param('two repositories, one counted', 'countedRepositoryId');
      const pending = param('two repositories, one counted', 'pendingRepositoryId');
      const both = store.totals([counted, pending]);
      expect(both?.partial).toBe(true);
      expect(both?.main).toBeGreaterThan(0);
      expect(store.totals([counted])).toEqual({ ...both, partial: false });
    }));
});
