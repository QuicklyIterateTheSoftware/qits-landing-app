import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction, type NonJsonResponse } from '@qits/angular/testing';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE as CONTRACTS,
} from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { asDatabaseIndex, type DatabaseIndex } from '$core/contracts/database-diagram';
import { contractsSiteOf, type ContractsSite, type ContractsSites } from './contracts-catalog';
import { literalDocsPaths } from './docs-paths';
import {
  DOCS_REPOSITORY,
  GET_DOCS_FILE,
  GET_DOCS_VERSION,
  LIST_DOCS_SITES,
  LIST_DOCS_VERSIONS,
  type DocsSite,
  type DocsVersions,
} from './docs.consumes';
import { DOCS_FILE, DOCS_SITES, DOCS_VERSION, DOCS_VERSIONS } from './docs.operations';
import { asEntityMap, type EntityMap } from './entity-map';
import { safeRecordedFile } from './golden-masters';
import { blobDataUrl, routesSiteOf, type BundleVersion } from './routes-bundles';
import { asManifest, hasViewports, routeStates } from './routes-manifest';

/**
 * qits-landing-app's pact with qits-artifacts-service (qits-1950, qits-1951, qits-1994, qits-1999),
 * the docs store's operations (`docs.operations.ts`, qits-2146): one part per reader, each in a
 * block of its own, as each was its store's own spec before (`entity-map.store.pact.spec.ts`,
 * `routes-bundle.store.pact.spec.ts`, `contracts-bundle.store.pact.spec.ts`,
 * `golden-masters.store.pact.spec.ts`), moved here unchanged: the same descriptions, states,
 * requests and bound fields, each part owning the same interactions of the file. Each test makes
 * the step of `ContractsCatalog`, `RoutesBundles` or `ContractsBundles` it answers through the
 * operations' own `fetch` (the helpers below), and checks it with the services' own pure steps
 * (`contractsSiteOf`, `routesSiteOf`, `asEntityMap`, `asManifest`, `asDatabaseIndex`).
 */

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

it('declares the provider these parts bind', () => {
  for (const op of [DOCS_SITES, DOCS_VERSIONS, DOCS_VERSION, DOCS_FILE]) {
    expect(op.provider).toBe('qits-artifacts-service');
  }
});

const DOCS = { repository: DOCS_REPOSITORY } as const;

/** The docs sites named `prefix…`, each with its versions (null when they could not be read). */
async function sitesWithVersions(
  prefix: string,
): Promise<{ site: DocsSite; versions: DocsVersions | null }[] | null> {
  const { data, error } = await DOCS_SITES.fetch({ path: DOCS });
  if (error !== undefined || !data) return null;
  const sites = (data.sites ?? []).filter((site) => site.name?.startsWith(prefix));
  return Promise.all(
    sites.map(async (site) => {
      const answer = await DOCS_VERSIONS.fetch({ path: { ...DOCS, site: site.name ?? '' } });
      return { site, versions: answer.error !== undefined || !answer.data ? null : answer.data };
    }),
  );
}

/** Every `@contracts/` site and the repository its newest version names, as `ContractsCatalog` finds them. */
async function contractsSitesFound(): Promise<ContractsSites | null> {
  const found = await sitesWithVersions('@contracts/');
  if (!found) return null;
  const sites: ContractsSite[] = [];
  const unreadable: string[] = [];
  for (const { site, versions } of found) {
    if (!versions) unreadable.push(site.name ?? '');
    else {
      const named = contractsSiteOf(site, versions);
      if (named !== 'unnamed') sites.push(named);
    }
  }
  return { sites, unreadable };
}

/** The `@routes/` site whose newest version names `repo`, as `RoutesBundles` finds it. */
async function routesSiteFound(repo: string) {
  const found = await sitesWithVersions('@routes/');
  if (!found) return null;
  const byName = new Map(found.map(({ site, versions }) => [site.name ?? '', versions]));
  return routesSiteOf(
    repo,
    found.map(({ site }) => site),
    (name) => {
      const versions = byName.get(name);
      return {
        hasValue: () => !!versions,
        status: () => (versions ? 'resolved' : 'error'),
        value: () => versions,
      };
    },
  );
}

/** `path` of the version, as `DOCS_FILE` answers it (`as` asks for text or a blob). */
async function fileOf(
  { site, version }: BundleVersion,
  path: string,
  as?: { responseType: 'text' | 'blob' },
) {
  const { data, error, response } = await DOCS_FILE.fetch({
    path: { ...DOCS, site, version, path },
    ...as,
  });
  return { data: data as unknown, failed: error !== undefined, status: response?.status };
}

/** A file of a contracts site's version, as `ContractsBundles` reads it; null when it fails. */
async function contractsFileFound(
  site: ContractsSite | BundleVersion,
  path: string,
): Promise<unknown> {
  const file = await fileOf(site, path);
  return file.failed ? null : file.data;
}

/** The version's `entities.json`, as `ContractsCatalog.mapRead` makes it. */
async function entityMapFound(
  site: ContractsSite | BundleVersion,
): Promise<EntityMap | 'none' | null> {
  const file = await fileOf(site, 'entities.json');
  if (file.status === 404) return 'none';
  return file.failed ? null : asEntityMap(file.data);
}

/** The bundle's `manifest.json`, as `RoutesBundles` checks it; null when it fails. */
async function manifestFound(bundle: BundleVersion) {
  const file = await fileOf(bundle, 'manifest.json');
  return file.failed ? null : asManifest(file.data);
}

/** One freeze's HTML; null when it cannot be read. */
async function freezeHtmlFound(bundle: BundleVersion, path: string): Promise<string | null> {
  const file = await fileOf(bundle, path, { responseType: 'text' });
  return !file.failed && typeof file.data === 'string' ? file.data : null;
}

/** The bundle's `assets/*`, from the version's file list; none when it fails. */
async function assetFilesFound({ site, version }: BundleVersion): Promise<readonly string[]> {
  const { data, error } = await DOCS_VERSION.fetch({ path: { ...DOCS, site, version } });
  return error === undefined ? (data?.files ?? []).filter((f) => f.startsWith('assets/')) : [];
}

/** One asset as a `data:` URL; null when it cannot be read. */
async function dataUrlFound(bundle: BundleVersion, path: string): Promise<string | null> {
  const file = await fileOf(bundle, path, { responseType: 'blob' });
  return !file.failed && file.data instanceof Blob ? blobDataUrl(file.data) : null;
}

/** The version's `database/index.json`, as `ContractsBundles` checks it. */
async function databaseIndexFound(site: BundleVersion): Promise<DatabaseIndex | 'none' | null> {
  const file = await fileOf(site, 'database/index.json');
  if (file.status === 404) return 'none';
  return file.failed ? null : asDatabaseIndex(file.data);
}

/** One unit's diagram as Markdown text, as `ContractsBundles` reads it. */
async function diagramFound(site: BundleVersion, file: string): Promise<string | 'none' | null> {
  if (!safeRecordedFile(file)) return null;
  const read = await fileOf(site, `database/${file}`, { responseType: 'text' });
  if (read.status === 404) return 'none';
  return !read.failed && typeof read.data === 'string' ? read.data : null;
}

{
  /**
   * qits-landing-app's pact with qits-artifacts-service, the entity map's part (qits-1950):
   * `pacts/qits-landing-app_qits-artifacts-service.json`, shared with the routes bundle's part.
   * This spec owns the docs-store operations' interactions for `show-ui-builder-entities` alone.
   *
   * Against a pact mock server answering with qits-artifacts' recording of `a published contracts
   * bundle with an entity map`: a catalog with `@routes/qits-landing` and `@contracts/qits-projects`,
   * the contracts site's versions (its newest naming `qits-projects-service`) and its
   * `entities.json`. A path from a provider state matches any path, so each test adds at most one
   * interaction with a path parameter and makes the one step of `ContractsCatalog` it answers.
   * `listDocsSites` is bound by its recorded first element (the list is "at least the recorded
   * count" of that shape), so the mock server repeats that site: the provider lists sites by
   * name, and `@contracts/qits-projects` sorts before `@routes/qits-landing`, so it is the contracts
   * site the store goes on to read.
   * `getDocsFile` answers a file: its interaction binds the status and the media type
   * (`NonJsonResponse`), its example body the recorded map.
   */
  const CONSUMER = 'qits-landing-app';
  const PROVIDER = 'qits-artifacts-service';
  const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
  const SLUG: InteractionSlug = 'show-ui-builder-entities';
  const OPERATIONS: readonly OwnedOperation[] = [
    'listDocsSites',
    'listDocsVersions',
    'getDocsFile',
  ].map((operationId) => ({ operationId, interactions: [SLUG] }));

  const given = (operationId: string, consumes: readonly string[], response?: NonJsonResponse) =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: CONTRACTS,
      operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: SLUG },
      consumes,
      response,
    });

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

  const params = (operationId: string) => masters.operation(CONTRACTS, operationId).params;

  let dir = '';
  let pact: PactV4;

  describe('qits-landing-app → qits-artifacts-service pact: entity maps', () => {
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'qits-landing-artifacts-entities-pact-'));
      pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
    });

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

    it('show-ui-builder-entities: finds each contracts site’s repository by its newest version’s metadata', () => {
      given('listDocsSites', LIST_DOCS_SITES);
      return given('listDocsVersions', LIST_DOCS_VERSIONS).executeTest(async (server) => {
        const found = await at(server.url, () => contractsSitesFound());
        // The catalog is bound by its recorded first element at the recorded length, so the mock
        // server repeats `@contracts/qits-projects`: each entry is that site, read from its versions.
        expect(found?.unreadable).toEqual([]);
        expect(found?.sites.length).toBeGreaterThan(0);
        expect(new Set(found?.sites.map((site) => JSON.stringify(site)))).toEqual(
          new Set([
            JSON.stringify({
              site: params('listDocsVersions')['site'],
              version: params('getDocsFile')['version'],
              repository: 'qits-projects-service',
            }),
          ]),
        );
      });
    });

    it('show-ui-builder-entities: reads the version’s entity map', () =>
      given('getDocsFile', GET_DOCS_FILE, {
        contentType: 'application/json',
        body: new TextEncoder().encode(JSON.stringify(masters.body(CONTRACTS, 'getDocsFile'))),
      }).executeTest(async (server) => {
        const map = await at(server.url, () =>
          entityMapFound({
            site: params('getDocsFile')['site'],
            version: params('getDocsFile')['version'],
          }),
        );
        expect(map).not.toBeNull();
        expect(map).toEqual(asEntityMap(masters.body(CONTRACTS, 'getDocsFile')));
      }));
  });
}

{
  /**
   * qits-landing-app's pact with qits-artifacts-service (qits-1951):
   * `pacts/qits-landing-app_qits-artifacts-service.json`, written by this spec's four parts.
   *
   * The UI builder's reads, against a pact mock server answering with qits-artifacts' golden masters:
   *
   * - `a published routes bundle`: `@routes/qits-landing`, whose newest version names
   *   `qits-landing-app`, found through `listDocsSites` and `listDocsVersions`; its `manifest.json`
   *   (`getDocsFile`) and its file list (`getDocsVersion`, for the assets).
   * - `a published routes bundle with kinds and viewports` (qits-2059): the same site at a newer
   *   version, whose manifest gives each freeze the kind of its outcome and the preset width it was
   *   shot at (qits-2046): `projects/:slug/repositories` in the states `loaded` (DATA, at PHONE,
   *   TABLET and DESKTOP), `empty` (NO_DATA, DESKTOP) and `error` (ERROR, at the test's own width),
   *   found through `listDocsSites` and `listDocsVersions`, and its `manifest.json` (`getDocsFile`).
   * - `a published docs site`: a catalog with no `@routes/` site, so `load` finds nothing.
   * - `a published routes bundle freeze` / `… font`: one freeze's HTML and one asset (a font).
   *
   * A path from a provider state matches any path, so each test adds at most one interaction with a
   * path parameter and makes the one step of `RoutesBundles` it answers (the operations' reads, as
   * the steps below make them); `routes-bundles.spec.ts` drives the service whole. The
   * mock server still sees each request's real path, which the provider then replays: the site and
   * the file path with `/` and `@` literal and `[`/`]` encoded (`literalDocsPaths`).
   *
   * `getDocsFile` answers a file, not JSON the pact binds by field: each of its interactions binds
   * the status and the media type (`NonJsonResponse`). The manifest's example body is the recorded
   * one, so the store reads a real manifest; the freeze and the font bind no example body, so the
   * mock server answers an empty one of their media type (the freeze's recorded HTML, qits-2041, is
   * what the UI builder's browser spec shows, read as text).
   */
  const CONSUMER = 'qits-landing-app';
  const PROVIDER = 'qits-artifacts-service';
  const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
  /**
   * The docs-store operations' interactions for the routes and the states. The entity maps' part
   * owns the same operations' interactions for `show-ui-builder-entities`.
   */
  const OPERATIONS: readonly OwnedOperation[] = [
    'listDocsSites',
    'listDocsVersions',
    'getDocsVersion',
    'getDocsFile',
  ].map((operationId) => ({
    operationId,
    interactions: ['show-ui-builder-routes', 'show-ui-builder-state'],
  }));

  const BUNDLE = 'a published routes bundle';
  const FREEZE = 'a published routes bundle freeze';
  const FONT = 'a published routes bundle font';
  const NO_ROUTES = 'a published docs site';
  const KINDS = 'a published routes bundle with kinds and viewports';

  /** The repository the bundle's newest version names (`git.repository.name`). */
  const REPO = 'qits-landing-app';

  const dir = mkdtempSync(join(tmpdir(), 'qits-landing-artifacts-pact-'));
  const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

  const given = (
    slug: InteractionSlug,
    state: string,
    operationId: string,
    consumes: readonly string[],
    response?: NonJsonResponse,
  ) =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state,
      operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
      consumes,
      response,
    });

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

  const params = (state: string, operationId = 'getDocsFile') =>
    masters.operation(state, operationId).params;

  /** The bundle a state's params name. */
  const bundleOf = (state: string, operationId = 'getDocsFile') => ({
    site: params(state, operationId)['site'],
    version: params(state, operationId)['version'],
  });

  describe('qits-landing-app → qits-artifacts-service pact: routes bundle', () => {
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

    it('show-ui-builder-routes: finds the repository’s site by its newest version’s metadata', () => {
      given('show-ui-builder-routes', BUNDLE, 'listDocsSites', LIST_DOCS_SITES);
      return given(
        'show-ui-builder-routes',
        BUNDLE,
        'listDocsVersions',
        LIST_DOCS_VERSIONS,
      ).executeTest(async (server) => {
        const found = await at(server.url, () => routesSiteFound(REPO));
        expect(found).toEqual(bundleOf(BUNDLE, 'listDocsVersions'));
      });
    });

    it('show-ui-builder-routes: reads the bundle’s manifest', () =>
      given('show-ui-builder-routes', BUNDLE, 'getDocsFile', GET_DOCS_FILE, {
        contentType: 'application/json',
        body: new TextEncoder().encode(JSON.stringify(masters.body(BUNDLE, 'getDocsFile'))),
      }).executeTest(async (server) => {
        const manifest = await at(server.url, () => manifestFound(bundleOf(BUNDLE)));
        expect(manifest).toEqual(masters.body(BUNDLE, 'getDocsFile'));
      }));

    it('show-ui-builder-routes: finds a bundle with kinds and viewports by its newest version', () => {
      given('show-ui-builder-routes', KINDS, 'listDocsSites', LIST_DOCS_SITES);
      return given(
        'show-ui-builder-routes',
        KINDS,
        'listDocsVersions',
        LIST_DOCS_VERSIONS,
      ).executeTest(async (server) => {
        const found = await at(server.url, () => routesSiteFound(REPO));
        expect(found).toEqual(bundleOf(KINDS, 'listDocsVersions'));
      });
    });

    it('show-ui-builder-routes: reads a manifest whose freezes carry kinds and viewports', () =>
      given('show-ui-builder-routes', KINDS, 'getDocsFile', GET_DOCS_FILE, {
        contentType: 'application/json',
        body: new TextEncoder().encode(JSON.stringify(masters.body(KINDS, 'getDocsFile'))),
      }).executeTest(async (server) => {
        const manifest = await at(server.url, () => manifestFound(bundleOf(KINDS)));
        expect(manifest).toEqual(masters.body(KINDS, 'getDocsFile'));
        // `asManifest` keeps every kind and width: the route's states, data first, each with its
        // freezes' widths, and the switch shows.
        expect(hasViewports(manifest!)).toBe(true);
        expect(
          routeStates(manifest!, 'projects/:slug/repositories').map((state) => ({
            name: state.name,
            kind: state.kind,
            viewports: state.freezes.map((freeze) => freeze.viewport).sort(),
          })),
        ).toEqual([
          { name: 'loaded', kind: 'DATA', viewports: ['DESKTOP', 'PHONE', 'TABLET'] },
          { name: 'empty', kind: 'NO_DATA', viewports: ['DESKTOP'] },
          { name: 'error', kind: 'ERROR', viewports: [null] },
        ]);
      }));

    it('show-ui-builder-routes: a catalog without a @routes/ site publishes nothing for it', () =>
      given('show-ui-builder-routes', NO_ROUTES, 'listDocsSites', LIST_DOCS_SITES).executeTest(
        async (server) => {
          const found = await at(server.url, () => routesSiteFound(REPO));
          expect(found).toEqual('none');
        },
      ));

    it('show-ui-builder-state: reads a freeze’s HTML', () =>
      given('show-ui-builder-state', FREEZE, 'getDocsFile', GET_DOCS_FILE, {
        contentType: 'text/html',
      }).executeTest(async (server) => {
        const html = await at(server.url, () =>
          freezeHtmlFound(bundleOf(FREEZE), params(FREEZE)['path']),
        );
        // No example body bound: the mock server answers an empty page.
        expect(html).toBe('');
      }));

    it('show-ui-builder-state: lists the bundle’s assets', () =>
      given('show-ui-builder-state', BUNDLE, 'getDocsVersion', GET_DOCS_VERSION).executeTest(
        async (server) => {
          const files = await at(server.url, () =>
            assetFilesFound(bundleOf(BUNDLE, 'getDocsVersion')),
          );
          // The list is bound by its recorded first element (the font of `a published routes
          // bundle font`) at the recorded length, so the mock server repeats it: only assets stay.
          expect(files.length).toBeGreaterThan(0);
          expect(new Set(files)).toEqual(new Set([params(FONT)['path']]));
        },
      ));

    it('show-ui-builder-state: reads an asset as a data: URL', () =>
      given('show-ui-builder-state', FONT, 'getDocsFile', GET_DOCS_FILE, {
        contentType: 'font/woff2',
      }).executeTest(async (server) => {
        const url = await at(server.url, () => dataUrlFound(bundleOf(FONT), params(FONT)['path']));
        expect(url).toMatch(/^data:font\/woff2[;,]/);
      }));
  });
}

{
  /**
   * qits-landing-app's pact with qits-artifacts-service, the contracts and entities pages' part
   * (qits-1994): `pacts/qits-landing-app_qits-artifacts-service.json`, shared with the UI builder's
   * specs (`core/ui-builder/*.pact.spec.ts`). This spec owns the docs operations' interactions for
   * the four pages' slugs alone.
   *
   * Every page finds the repository's bundle from the catalog (`listDocsSites`, then each
   * `@contracts/` site's `listDocsVersions`, `contractsSitesFound`) and reads files of it
   * (`getDocsFile`): the contracts pages `golden-masters/index.json` and the recorded responses
   * (`ContractsBundles`, the call popover's reads too), the entities pages
   * `entities.json` (`entityMapFound`). Against qits-artifacts' recording of `a published contracts
   * bundle with an entity map`, as the entity maps' part explains: a path from a provider
   * state matches any path, so each test adds at most one interaction with a path parameter, and
   * `getDocsFile` binds the status and media type only (`NonJsonResponse`), its example body the
   * state's recorded file. The reads go through `contractsFileFound`, a read of its own, so each test's read
   * reaches its mock server.
   *
   * The entity page also reads the ER diagram of the entity's unit (qits-2014): the bundle's
   * `database/index.json` (`databaseIndexFound`) and the unit's `database/<file>.md`
   * (`diagramFound`). No recording of qits-artifacts holds a bundle's database files yet, so each
   * read binds what the docs store answers for a file of its media type: the index as the entity
   * map's JSON file is bound (the recorded `entities.json` is its example body, which is not an
   * index), and the Markdown file as `a repository with published changelogs` records one,
   * `text/markdown`, binding the header only (Pact sniffs a Markdown body as `text/plain`). The
   * provider replays each state's own path.
   *
   * The pages' links (epic qits-2000) are shown against qits-2041's states: `a published contracts
   * bundle with a golden-master index` (`@contracts/qits-githost`, naming qits-githost-service, in a
   * catalog that also lists `@contracts/qits-projects`: its catalog, versions and index, for the
   * contracts list, a state's page and an entity's "Recorded in"), `a published contracts bundle a
   * dependency points into` (`@contracts/qits-projects`'s index, which a githost state's dependency
   * links into) and `a published contracts bundle with a projection entity` (qits-githost's
   * `entities.json`, whose GitProject projects qits-projects' Project).
   */
  const CONSUMER = 'qits-landing-app';
  const PROVIDER = 'qits-artifacts-service';
  const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
  const SLUGS: readonly InteractionSlug[] = [
    'show-repository-contracts',
    'show-contract-state',
    'show-repository-entities',
    'show-entity',
  ];
  const OPERATIONS: readonly OwnedOperation[] = [
    'listDocsSites',
    'listDocsVersions',
    'getDocsFile',
  ].map((operationId) => ({ operationId, interactions: SLUGS }));

  const given = (
    slug: InteractionSlug,
    operationId: string,
    consumes: readonly string[],
    response?: NonJsonResponse,
    state = CONTRACTS,
  ) =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state,
      operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
      consumes,
      response,
    });

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

  const params = (operationId: string) => masters.operation(CONTRACTS, operationId).params;

  /** qits-2041: `@contracts/qits-githost` with an index, in a catalog listing two contracts sites. */
  const INDEX = 'a published contracts bundle with a golden-master index';
  /** qits-2041: `@contracts/qits-projects`'s index, holding the state a githost state depends on. */
  const DEPENDENCY = 'a published contracts bundle a dependency points into';
  /** qits-2041: qits-githost's `entities.json`, with a projection of qits-projects' Project. */
  const PROJECTION = 'a published contracts bundle with a projection entity';

  /** The contracts site `state`'s `getDocsFile` reads, naming `repository`. */
  const siteOf = (state: string, repository: string) => ({
    site: masters.operation(state, 'getDocsFile').params['site'],
    version: masters.operation(state, 'getDocsFile').params['version'],
    repository,
  });

  /** `state`'s recorded file, as `getDocsFile` answers it. */
  const recordedFileOf = (state: string): NonJsonResponse => ({
    contentType: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(masters.body(state, 'getDocsFile'))),
  });

  /** The state recording a Markdown file of the docs store (a changelog), for a diagram's read. */
  const MARKDOWN = 'a repository with published changelogs';

  /** The recorded contracts site, as `contractsSitesFound` finds it. */
  const site = () => ({
    site: params('getDocsFile')['site'],
    version: params('getDocsFile')['version'],
    repository: 'qits-projects-service',
  });

  /** The recorded file, as `getDocsFile` answers it. */
  const recordedFile = (): NonJsonResponse => ({
    contentType: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(masters.body(CONTRACTS, 'getDocsFile'))),
  });

  /** What each page reads of the bundle, as one `getDocsFile` step. */
  const FILE_READS: Readonly<Record<string, string>> = {
    'show-repository-contracts': 'golden-masters/index.json',
    'show-contract-state': 'golden-masters/a-project-exists/listProjects.json',
    'show-repository-entities': 'entities.json',
    'show-entity': 'entities.json',
  };

  let dir = '';
  let pact: PactV4;

  describe('qits-landing-app → qits-artifacts-service pact: contracts and entities pages', () => {
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'qits-landing-artifacts-contracts-pact-'));
      pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
    });

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

    for (const slug of SLUGS) {
      it(`${slug}: finds the repository’s contracts site by its newest version’s metadata`, () => {
        given(slug, 'listDocsSites', LIST_DOCS_SITES);
        return given(slug, 'listDocsVersions', LIST_DOCS_VERSIONS).executeTest(async (server) => {
          const found = await at(server.url, () => contractsSitesFound());
          // The catalog is bound by its recorded first element, `@contracts/qits-projects`, repeated.
          expect(found?.unreadable).toEqual([]);
          expect(found?.sites.length).toBeGreaterThan(0);
          expect(found?.sites.every((s) => JSON.stringify(s) === JSON.stringify(site()))).toBe(
            true,
          );
        });
      });
    }

    for (const slug of SLUGS.filter((s) => FILE_READS[s].startsWith('golden-masters/'))) {
      it(`${slug}: reads ${FILE_READS[slug]} of the site’s version`, () =>
        given(slug, 'getDocsFile', GET_DOCS_FILE, recordedFile()).executeTest(async (server) => {
          const file = await at(server.url, () => contractsFileFound(site(), FILE_READS[slug]));
          expect(file).toEqual(masters.body(CONTRACTS, 'getDocsFile'));
        }));
    }

    for (const slug of SLUGS.filter((s) => FILE_READS[s] === 'entities.json')) {
      it(`${slug}: reads the version’s entity map`, () =>
        given(slug, 'getDocsFile', GET_DOCS_FILE, recordedFile()).executeTest(async (server) => {
          const map = await at(server.url, () => entityMapFound(site()));
          expect(map).not.toBeNull();
          expect(map).toEqual(asEntityMap(masters.body(CONTRACTS, 'getDocsFile')));
        }));
    }

    const INDEX_READERS: readonly InteractionSlug[] = [
      'show-repository-contracts',
      'show-contract-state',
      'show-entity',
    ];

    for (const slug of INDEX_READERS) {
      it(`${slug}: finds a githost contracts site in a catalog of two`, () => {
        given(slug, 'listDocsSites', LIST_DOCS_SITES, undefined, INDEX);
        return given(slug, 'listDocsVersions', LIST_DOCS_VERSIONS, undefined, INDEX).executeTest(
          async (server) => {
            const found = await at(server.url, () => contractsSitesFound());
            // Bound by the recorded first element, `@contracts/qits-githost`, repeated.
            const githost = JSON.stringify(siteOf(INDEX, 'qits-githost-service'));
            expect(found?.unreadable).toEqual([]);
            expect(found?.sites.length).toBeGreaterThan(0);
            expect(found?.sites.every((s) => JSON.stringify(s) === githost)).toBe(true);
          },
        );
      });

      it(`${slug}: reads the githost site’s golden-masters/index.json`, () =>
        given(slug, 'getDocsFile', GET_DOCS_FILE, recordedFileOf(INDEX), INDEX).executeTest(
          async (server) => {
            const file = await at(server.url, () =>
              contractsFileFound(
                siteOf(INDEX, 'qits-githost-service'),
                'golden-masters/index.json',
              ),
            );
            expect(file).toEqual(masters.body(INDEX, 'getDocsFile'));
          },
        ));
    }

    it('show-contract-state: reads the index a dependency points into', () =>
      given(
        'show-contract-state',
        'getDocsFile',
        GET_DOCS_FILE,
        recordedFileOf(DEPENDENCY),
        DEPENDENCY,
      ).executeTest(async (server) => {
        const file = await at(server.url, () =>
          contractsFileFound(
            siteOf(DEPENDENCY, 'qits-projects-service'),
            'golden-masters/index.json',
          ),
        );
        expect(file).toEqual(masters.body(DEPENDENCY, 'getDocsFile'));
      }));

    it('show-entity: reads an entity map holding a projection', () =>
      given(
        'show-entity',
        'getDocsFile',
        GET_DOCS_FILE,
        recordedFileOf(PROJECTION),
        PROJECTION,
      ).executeTest(async (server) => {
        const map = await at(server.url, () =>
          entityMapFound(siteOf(PROJECTION, 'qits-githost-service')),
        );
        expect(map).toEqual(asEntityMap(masters.body(PROJECTION, 'getDocsFile')));
        expect(map && map !== 'none' && map.entities.some((e) => e.marking === 'projection')).toBe(
          true,
        );
      }));

    it('show-entity: reads the version’s database/index.json', () =>
      given('show-entity', 'getDocsFile', GET_DOCS_FILE, recordedFile()).executeTest(
        async (server) => {
          const index = await at(server.url, () => databaseIndexFound(site()));
          // The example body is the recorded `entities.json`: read, and checked as not an index.
          expect(index).toEqual(asDatabaseIndex(masters.body(CONTRACTS, 'getDocsFile')));
        },
      ));

    it('show-entity: reads a unit’s ER diagram as Markdown', () =>
      given(
        'show-entity',
        'getDocsFile',
        GET_DOCS_FILE,
        // The header alone: Pact's content-type body matcher sniffs Markdown as text/plain, so a
        // bound body fails at the provider however the docs store labels it.
        { contentType: 'text/markdown' },
        MARKDOWN,
      ).executeTest(async (server) => {
        const markdown = await at(server.url, () => diagramFound(site(), 'projects.md'));
        expect(typeof markdown).toBe('string');
      }));
  });
}

{
  /**
   * qits-landing-app's pact with qits-artifacts-service, the call popover's part (qits-1999):
   * `pacts/qits-landing-app_qits-artifacts-service.json`, shared with the entity maps'
   * and the routes bundle's parts. This spec owns `getDocsFile`'s interaction for
   * `show-ui-builder-call-details` alone.
   *
   * The popover reads two files of a contracts site, `golden-masters/index.json` and one recorded
   * response. Both are `getDocsFile`: a file as published, so the interaction binds its status and
   * media type (`NonJsonResponse`), never a field. A path from a provider state matches any path, so
   * qits-artifacts' recording of `a published contracts bundle with an entity map` answers it; its
   * example body is that state's recorded file. The popover's links (epic qits-2000) are shown with
   * qits-2041's `a published contracts bundle with a golden-master index` (`@contracts/qits-githost`),
   * whose index the popover reads too.
   */
  const CONSUMER = 'qits-landing-app';
  const PROVIDER = 'qits-artifacts-service';
  const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
  const SLUG: InteractionSlug = 'show-ui-builder-call-details';
  const OPERATIONS: readonly OwnedOperation[] = [
    { operationId: 'getDocsFile', interactions: [SLUG] },
  ];

  /** qits-2041: `@contracts/qits-githost` with a `golden-masters/index.json`. */
  const INDEX = 'a published contracts bundle with a golden-master index';

  const given = (
    operationId: string,
    consumes: readonly string[],
    response?: NonJsonResponse,
    state = CONTRACTS,
  ) =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state,
      operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: SLUG },
      consumes,
      response,
    });

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

  const params = (operationId: string) => masters.operation(CONTRACTS, operationId).params;

  let dir = '';
  let pact: PactV4;

  describe('qits-landing-app → qits-artifacts-service pact: call details', () => {
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'qits-landing-artifacts-call-details-pact-'));
      pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
    });

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

    it('show-ui-builder-call-details: reads a file of the contracts site’s version', () =>
      given('getDocsFile', GET_DOCS_FILE, {
        contentType: 'application/json',
        body: new TextEncoder().encode(JSON.stringify(masters.body(CONTRACTS, 'getDocsFile'))),
      }).executeTest(async (server) => {
        const file = await at(server.url, () =>
          contractsFileFound(
            {
              site: params('getDocsFile')['site'],
              version: params('getDocsFile')['version'],
              repository: 'qits-projects-service',
            },
            'golden-masters/index.json',
          ),
        );
        expect(file).toEqual(masters.body(CONTRACTS, 'getDocsFile'));
      }));

    it('show-ui-builder-call-details: reads the githost contracts site’s golden-masters/index.json', () =>
      given(
        'getDocsFile',
        GET_DOCS_FILE,
        {
          contentType: 'application/json',
          body: new TextEncoder().encode(JSON.stringify(masters.body(INDEX, 'getDocsFile'))),
        },
        INDEX,
      ).executeTest(async (server) => {
        const op = masters.operation(INDEX, 'getDocsFile');
        const file = await at(server.url, () =>
          contractsFileFound(
            {
              site: op.params['site'],
              version: op.params['version'],
              repository: 'qits-githost-service',
            },
            'golden-masters/index.json',
          ),
        );
        expect(file).toEqual(masters.body(INDEX, 'getDocsFile'));
      }));
  });
}
