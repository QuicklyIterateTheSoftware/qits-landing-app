import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction, type NonJsonResponse } from '@qits/angular/testing';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { literalDocsPaths } from './docs-paths';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { artifactsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  GET_DOCS_FILE,
  GET_DOCS_VERSION,
  LIST_DOCS_SITES,
  LIST_DOCS_VERSIONS,
} from './routes-bundle.consumes';
import {
  assetFilesOf,
  dataUrlOf,
  freezeHtmlOf,
  routesManifestOf,
  routesSiteOf,
  RoutesBundleStore,
} from './routes-bundle.store';

/**
 * qits-landing-app's pact with qits-artifacts-service (qits-1951):
 * `pacts/qits-landing-app_qits-artifacts-service.json`, written by this spec and, for the entity
 * maps (qits-1950), `entity-map.store.pact.spec.ts`.
 *
 * The UI builder's reads, against a pact mock server answering with qits-artifacts' golden masters:
 *
 * - `a published routes bundle`: `@routes/qits-landing`, whose newest version names
 *   `qits-landing-app`, found through `listDocsSites` and `listDocsVersions`; its `manifest.json`
 *   (`getDocsFile`) and its file list (`getDocsVersion`, for the assets).
 * - `a published docs site`: a catalog with no `@routes/` site, so `load` finds nothing.
 * - `a published routes bundle freeze` / `… font`: one freeze's HTML and one asset (a font).
 *
 * A path from a provider state matches any path, so each test adds at most one interaction with a
 * path parameter and makes the one read of `RoutesBundleStore` it answers (the exported steps,
 * `routesSiteOf`, `routesManifestOf`, …); `routes-bundle.store.spec.ts` drives the store whole. The
 * mock server still sees each request's real path, which the provider then replays: the site and
 * the file path with `/` and `@` literal and `[`/`]` encoded (`literalDocsPaths`).
 *
 * `getDocsFile` answers a file, not JSON the pact binds by field: each of its interactions binds
 * the status and the media type (`NonJsonResponse`). The manifest's example body is the recorded
 * one, so the store reads a real manifest; the freeze and the font are recorded without a body, so
 * the mock server answers an empty one of their media type.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-artifacts-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
/**
 * The docs-store operations' interactions for the routes and the states. `entity-map.store.pact.spec.ts`
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

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

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
      const found = await at(server.url, () => routesSiteOf(REPO));
      expect(found).toEqual(bundleOf(BUNDLE, 'listDocsVersions'));
    });
  });

  it('show-ui-builder-routes: reads the bundle’s manifest', () =>
    given('show-ui-builder-routes', BUNDLE, 'getDocsFile', GET_DOCS_FILE, {
      contentType: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(masters.body(BUNDLE, 'getDocsFile'))),
    }).executeTest(async (server) => {
      const manifest = await at(server.url, () => routesManifestOf(bundleOf(BUNDLE)));
      expect(manifest).toEqual(masters.body(BUNDLE, 'getDocsFile'));
    }));

  it('show-ui-builder-routes: a catalog without a @routes/ site publishes nothing for it', () =>
    given('show-ui-builder-routes', NO_ROUTES, 'listDocsSites', LIST_DOCS_SITES).executeTest(
      async (server) => {
        const store = await at(server.url, async () => TestBed.inject(RoutesBundleStore));
        await store.load(REPO);
        expect(store.bundles()[REPO]).toEqual({ status: 'none' });
      },
    ));

  it('show-ui-builder-state: reads a freeze’s HTML', () =>
    given('show-ui-builder-state', FREEZE, 'getDocsFile', GET_DOCS_FILE, {
      contentType: 'text/html',
    }).executeTest(async (server) => {
      const html = await at(server.url, () =>
        freezeHtmlOf(bundleOf(FREEZE), params(FREEZE)['path']),
      );
      // Recorded without a body: the mock server answers an empty page.
      expect(html).toBe('');
    }));

  it('show-ui-builder-state: lists the bundle’s assets', () =>
    given('show-ui-builder-state', BUNDLE, 'getDocsVersion', GET_DOCS_VERSION).executeTest(
      async (server) => {
        const files = await at(server.url, () => assetFilesOf(bundleOf(BUNDLE, 'getDocsVersion')));
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
      const url = await at(server.url, () => dataUrlOf(bundleOf(FONT), params(FONT)['path']));
      expect(url).toMatch(/^data:font\/woff2[;,]/);
    }));
});
