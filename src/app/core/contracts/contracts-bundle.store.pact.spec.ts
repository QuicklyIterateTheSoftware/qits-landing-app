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
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { asEntityMap } from '$core/ui-builder/entity-map';
import {
  GET_DOCS_FILE,
  LIST_DOCS_SITES,
  LIST_DOCS_VERSIONS,
} from '$core/ui-builder/entity-map.consumes';
import { contractsSitesOf, entityMapOf } from '$core/ui-builder/entity-map.store';
import { contractsFileOf } from '$core/ui-builder/golden-masters.store';
import { databaseIndexOf, diagramFileOf } from './contracts-bundle.store';
import { asDatabaseIndex } from './database-diagram';
import type { InteractionSlug } from '../../interactions';
import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE as CONTRACTS,
} from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';

/**
 * qits-landing-app's pact with qits-artifacts-service, the contracts and entities pages' part
 * (qits-1994): `pacts/qits-landing-app_qits-artifacts-service.json`, shared with the UI builder's
 * specs (`core/ui-builder/*.pact.spec.ts`). This spec owns the docs operations' interactions for
 * the four pages' slugs alone.
 *
 * Every page finds the repository's bundle from the catalog (`listDocsSites`, then each
 * `@contracts/` site's `listDocsVersions`, `contractsSitesOf`) and reads files of it
 * (`getDocsFile`): the contracts pages `golden-masters/index.json` and the recorded responses
 * (`ContractsBundleStore`, through `contractsFileOf`, the call popover's read), the entities pages
 * `entities.json` (`entityMapOf`). Against qits-artifacts' recording of `a published contracts
 * bundle with an entity map`, as `entity-map.store.pact.spec.ts` explains: a path from a provider
 * state matches any path, so each test adds at most one interaction with a path parameter, and
 * `getDocsFile` binds the status and media type only (`NonJsonResponse`), its example body the
 * state's recorded file. The reads go through the uncached `contractsFileOf`, so each test's read
 * reaches its mock server.
 *
 * The entity page also reads the ER diagram of the entity's unit (qits-2014): the bundle's
 * `database/index.json` (`databaseIndexOf`) and the unit's `database/<file>.md`
 * (`diagramFileOf`). No recording of qits-artifacts holds a bundle's database files yet, so each
 * read binds what the docs store answers for a file of its media type: the index as the entity
 * map's JSON file is bound (the recorded `entities.json` is its example body, which is not an
 * index), and the Markdown file as `a repository with published changelogs` records one,
 * `text/markdown` (recorded without a body, so the example is a diagram file of the generated
 * shape). The provider replays each state's own path.
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

/** The state recording a Markdown file of the docs store (a changelog), for a diagram's read. */
const MARKDOWN = 'a repository with published changelogs';

/** A diagram file as `qits database diagram` writes it, the Markdown read's example body. */
const DIAGRAM_FILE = [
  '# Persistence unit `projects`',
  '',
  '```mermaid',
  'erDiagram',
  '  project {',
  '    uuid id PK "not null"',
  '  }',
  '```',
  '',
].join('\n');

/** The recorded contracts site, as `contractsSitesOf` finds it. */
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

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

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
        const found = await at(server.url, () => contractsSitesOf());
        // The catalog is bound by its recorded first element, `@contracts/qits-projects`, repeated.
        expect(found?.unreadable).toEqual([]);
        expect(found?.sites.length).toBeGreaterThan(0);
        expect(found?.sites.every((s) => JSON.stringify(s) === JSON.stringify(site()))).toBe(true);
      });
    });
  }

  for (const slug of SLUGS.filter((s) => FILE_READS[s].startsWith('golden-masters/'))) {
    it(`${slug}: reads ${FILE_READS[slug]} of the site’s version`, () =>
      given(slug, 'getDocsFile', GET_DOCS_FILE, recordedFile()).executeTest(async (server) => {
        const file = await at(server.url, () => contractsFileOf(site(), FILE_READS[slug]));
        expect(file).toEqual(masters.body(CONTRACTS, 'getDocsFile'));
      }));
  }

  for (const slug of SLUGS.filter((s) => FILE_READS[s] === 'entities.json')) {
    it(`${slug}: reads the version’s entity map`, () =>
      given(slug, 'getDocsFile', GET_DOCS_FILE, recordedFile()).executeTest(async (server) => {
        const map = await at(server.url, () => entityMapOf(site()));
        expect(map).not.toBeNull();
        expect(map).toEqual(asEntityMap(masters.body(CONTRACTS, 'getDocsFile')));
      }));
  }

  it('show-entity: reads the version’s database/index.json', () =>
    given('show-entity', 'getDocsFile', GET_DOCS_FILE, recordedFile()).executeTest(
      async (server) => {
        const index = await at(server.url, () => databaseIndexOf(site()));
        // The example body is the recorded `entities.json`: read, and checked as not an index.
        expect(index).toEqual(asDatabaseIndex(masters.body(CONTRACTS, 'getDocsFile')));
      },
    ));

  it('show-entity: reads a unit’s ER diagram as Markdown', () =>
    given(
      'show-entity',
      'getDocsFile',
      GET_DOCS_FILE,
      { contentType: 'text/markdown', body: new TextEncoder().encode(DIAGRAM_FILE) },
      MARKDOWN,
    ).executeTest(async (server) => {
      const markdown = await at(server.url, () => diagramFileOf(site(), 'projects.md'));
      expect(markdown).toBe(DIAGRAM_FILE);
    }));
});
