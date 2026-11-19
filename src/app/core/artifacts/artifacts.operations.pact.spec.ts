import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { artifactsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { listingOf } from './artifact-listings';
import {
  ARTIFACT_DAEMONS,
  ARTIFACT_DOCS_SITES,
  ARTIFACT_IMAGES,
  ARTIFACT_MAVEN_PACKAGES,
  ARTIFACT_NPM_PACKAGES,
  ARTIFACT_RECORDS,
  ARTIFACT_REPOSITORIES,
} from './artifacts.operations';

/**
 * qits-landing-app's pact with qits-artifacts-service, the store explorer's part (qits-2316):
 * `pacts/qits-landing-app_qits-artifacts-service.json`, shared with the docs store's parts
 * (`core/ui-builder/docs.operations.pact.spec.ts`). This spec owns every interaction of the store
 * repository page's operations (`artifacts.operations.ts`): `listRepositories`, `listImages`,
 * `listNpmPackages`, `listMavenPackages`, `listDaemons`, `listDocsSiteSummaries` and
 * `listArtifactRecords`.
 *
 * Against qits-artifacts' recordings of "a store holding one artifact of every kind" (the seeded
 * repositories, and one image, npm package, maven coordinate, daemon and docs site; no ci record)
 * and "a store with nothing published" (the seeded repositories, every listing empty). Each
 * populated listing is bound by its recorded entry, "at least" once (`listFilteredTo`), so it
 * verifies on the provider's shared database, where other suites' rows sit in the same seeded
 * repositories. An EMPTY recording (the empty store's images, and the ci records, which no state
 * can fill) would bind a literal `[]`, which that shared database cannot promise: those
 * interactions bind the status only (`STATUS_ONLY`), so they verify there too and still let the
 * screenshots of an empty repository show the recorded empty body (`pactedGoldenMasters` admits a
 * (state, operation) the pact uses). Each listing's repository is its state's param
 * (`imagesRepository`, …), a provider-state expression in the path; one listing per test, as a
 * path from a provider state matches any path.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`
 * against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-artifacts-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The populated store. */
const STORE = 'a store holding one artifact of every kind';
/** The seeded store with nothing published. */
const EMPTY = 'a store with nothing published';

const OPERATIONS: readonly OwnedOperation[] = [
  ARTIFACT_REPOSITORIES,
  ARTIFACT_IMAGES,
  ARTIFACT_NPM_PACKAGES,
  ARTIFACT_MAVEN_PACKAGES,
  ARTIFACT_DAEMONS,
  ARTIFACT_DOCS_SITES,
  ARTIFACT_RECORDS,
].map((op) => op.operationId);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-artifacts-store-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(artifactsClient),
    ],
  });
  artifactsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** An empty recorded listing's binding: the status only (see the file comment). */
const STATUS_ONLY: readonly string[] = [];

/**
 * The interaction for `op` in `state`, triggered by `interaction`, binding `op.consumes` (or
 * `consumes`, for an empty recording); `op` must be `PROVIDER`'s.
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

/** The store repository a state's listing is recorded for (`imagesRepository`, …). */
const repoOf = (state: string, param: string): string => {
  const params = masters.operation(state, 'listRepositories').params as Record<string, string>;
  const repo = params[param];
  if (!repo) throw new Error(`"${state}" has no ${param}`);
  return repo;
};

describe('qits-landing-app → qits-artifacts-service pact: the store repository page', () => {
  afterAll(() => {
    artifactsClient.setConfig({ baseUrl: '' });
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

  it('show-artifact-repositories: every store repository, with a listing chosen by its type', () =>
    given(ARTIFACT_REPOSITORIES, STORE, 'show-artifact-repositories').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => ARTIFACT_REPOSITORIES.fetch({}));
        // The list is bound by its recorded first element (a ci repository), at least once.
        const [row] = data?.repositories ?? [];
        expect(row?.name).toBeTruthy();
        expect(listingOf(row?.type)).toBe('records');
        expect(typeof row?.itemCount).toBe('number');
        expect(typeof row?.sizeBytes).toBe('number');
      },
    ));

  it('show-artifact-repositories: the seeded repositories, with nothing published', () =>
    given(ARTIFACT_REPOSITORIES, EMPTY, 'show-artifact-repositories').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => ARTIFACT_REPOSITORIES.fetch({}));
        expect((data?.repositories ?? []).length).toBeGreaterThan(0);
      },
    ));

  it('show-artifact-images: an image repository’s images', () =>
    given(ARTIFACT_IMAGES, STORE, 'show-artifact-images').executeTest(async (server) => {
      const repo = repoOf(STORE, 'imagesRepository');
      const { data } = await at(server.url, () => ARTIFACT_IMAGES.fetch({ path: { repo } }));
      const [image] = data?.images ?? [];
      expect(image?.name).toBeTruthy();
      expect(typeof image?.tagCount).toBe('number');
      expect(typeof image?.manifestCount).toBe('number');
    }));

  it('show-artifact-images: an image repository with nothing pushed', () =>
    given(ARTIFACT_IMAGES, EMPTY, 'show-artifact-images', STATUS_ONLY).executeTest(
      async (server) => {
        const repo = repoOf(EMPTY, 'imagesRepository');
        const { response, error } = await at(server.url, () =>
          ARTIFACT_IMAGES.fetch({ path: { repo } }),
        );
        // Status only: the shared database may hold other suites' images there.
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));

  it('show-artifact-npm-packages: an npm repository’s packages', () =>
    given(ARTIFACT_NPM_PACKAGES, STORE, 'show-artifact-npm-packages').executeTest(
      async (server) => {
        const repo = repoOf(STORE, 'npmRepository');
        const { data } = await at(server.url, () =>
          ARTIFACT_NPM_PACKAGES.fetch({ path: { repo } }),
        );
        const [pkg] = data?.packages ?? [];
        expect(pkg?.name).toBeTruthy();
        expect(pkg?.latest).toBeTruthy();
      },
    ));

  it('show-artifact-maven-packages: a maven repository’s coordinates', () =>
    given(ARTIFACT_MAVEN_PACKAGES, STORE, 'show-artifact-maven-packages').executeTest(
      async (server) => {
        const repo = repoOf(STORE, 'mavenRepository');
        const { data } = await at(server.url, () =>
          ARTIFACT_MAVEN_PACKAGES.fetch({ path: { repo } }),
        );
        const [pkg] = data?.packages ?? [];
        expect(pkg?.name).toContain(':');
        expect(typeof pkg?.sizeBytes).toBe('number');
      },
    ));

  it('show-artifact-daemons: a daemon repository’s daemons', () =>
    given(ARTIFACT_DAEMONS, STORE, 'show-artifact-daemons').executeTest(async (server) => {
      const repo = repoOf(STORE, 'daemonsRepository');
      const { data } = await at(server.url, () => ARTIFACT_DAEMONS.fetch({ path: { repo } }));
      const [daemon] = data?.daemons ?? [];
      expect(daemon?.name).toBeTruthy();
      expect(daemon?.latestVersion).toBeTruthy();
    }));

  it('show-artifact-docs-sites: a docs repository’s sites', () =>
    given(ARTIFACT_DOCS_SITES, STORE, 'show-artifact-docs-sites').executeTest(async (server) => {
      const repo = repoOf(STORE, 'docsRepository');
      const { data } = await at(server.url, () => ARTIFACT_DOCS_SITES.fetch({ path: { repo } }));
      const [site] = data?.sites ?? [];
      expect(site?.name).toBeTruthy();
      expect(site?.latestVersion).toBeTruthy();
    }));

  it('show-artifact-records: a ci repository’s records, none recorded', () =>
    given(ARTIFACT_RECORDS, STORE, 'show-artifact-records', STATUS_ONLY).executeTest(
      async (server) => {
        const repo = repoOf(STORE, 'screenshotsRepository');
        const { response, error } = await at(server.url, () =>
          ARTIFACT_RECORDS.fetch({ path: { repo } }),
        );
        // Status only: no state can fill a ci repository, and other suites' records sit there.
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));
});
