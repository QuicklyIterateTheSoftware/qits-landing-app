import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as mirrorClient } from '../../api/mirror/client.gen';
import { provideHeyApiClient } from '../../api/mirror/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import {
  heldBy,
  isRecorded,
  mirrorGoldenMasters as masters,
} from '../../../testing/golden-masters';
import { REPOSITORY_PACKAGES } from './repository-packages.operations';

/**
 * One cache root's part of qits-landing-app's pact with qits-mirror-service (qits-2358,
 * `repository-packages.operations.ts`), in `pacts/qits-landing-app_qits-mirror-service.json` — the
 * same file `upstreams.operations.pact.spec.ts` owns its operation of (`assertPactPart`).
 *
 * The Mirror section's repository page reads one root's contents (`show-mirror-repository`): in "a
 * mirror holding a pinned and an unpinned tag" (`hub`, an OCI root: `library/node` with two digests
 * tagged `24-alpine` and `22-alpine`), in "a maven cache holding a cached artifact" (`central`:
 * `org.example:contract-library` 1.0.0 with its jar and pom), in "an npm cache holding a package"
 * (`npmjs`: `left-pad` 1.3.0 tagged `latest`, which the page's `npm` screenshot shows, so the pact
 * must hold it), in "the default caches" (`hub`, which
 * nobody has pulled through: `packages: []`) and
 * in "no cache root of that name" (a 404 binding the status only: the page reads nothing of the
 * body). Each but the npm one skips itself until the `@qits/mirror-golden-masters` pin records it
 * (qits-mirror records them from its qits-2358 release on); the npm one binds the fields its
 * recording holds (`evictionWindow` from that release on). The test runs the operation's own `fetch`; the
 * interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-mirror-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listRepositoryPackages'];

const OCI = 'a mirror holding a pinned and an unpinned tag';
const MAVEN = 'a maven cache holding a cached artifact';
const NPM = 'an npm cache holding a package';
const EMPTY = 'the default caches';
const ABSENT = 'no cache root of that name';

/** Whether the pinned golden masters record the page's read in `state`. */
const recorded = (state: string) => isRecorded(state, OPERATIONS[0], masters);

/** The root `state` recorded (its `repository` param), as the page addresses it. */
const rootOf = (state: string) => ({
  path: { repository: masters.operation(state, OPERATIONS[0]).params['repository'] },
});

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-mirror-packages-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(mirrorClient),
    ],
  });
  mirrorClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** The interaction of the repository page's read in `state`, binding `consumes`. */
const given = (state: string, consumes: readonly string[] = REPOSITORY_PACKAGES.consumes) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: REPOSITORY_PACKAGES.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-mirror-repository' },
    consumes,
  });

describe('qits-landing-app → qits-mirror-service pact: one cache root', () => {
  afterAll(() => {
    mirrorClient.setConfig({ baseUrl: '' });
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
    expect(REPOSITORY_PACKAGES.provider).toBe(PROVIDER);
  });

  it.skipIf(!recorded(OCI))(
    'show-mirror-repository: an OCI root’s images with their digests and tags',
    () =>
      given(OCI).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => REPOSITORY_PACKAGES.fetch(rootOf(OCI)));
        expect(error).toBeUndefined();
        expect(data?.repository?.name).toBe('hub');
        expect(data?.repository?.type).toBe('oci-mirror');
        expect(data?.repository?.upstream).toBe('docker.io');
        expect(data?.repository?.evictionWindow).toBe('P30D');
        // The mock answers each row with the recording's first by type: as many, as recorded.
        expect(data?.packages).toHaveLength(1);
        const [pkg] = data?.packages ?? [];
        expect(pkg.name).toBe('library/node');
        expect(pkg.versions).toHaveLength(2);
        expect(pkg.versions?.[0].version).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(pkg.versions?.[0].labels).toEqual(['24-alpine']);
        expect(pkg.versions?.[0].files).toEqual([]);
      }),
  );

  it.skipIf(!recorded(MAVEN))(
    'show-mirror-repository: a maven root’s coordinates with their files',
    () =>
      given(MAVEN).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          REPOSITORY_PACKAGES.fetch(rootOf(MAVEN)),
        );
        expect(error).toBeUndefined();
        expect(data?.repository?.type).toBe('maven-proxy');
        expect(data?.repository?.evictionWindow).toBe('P90D');
        const [pkg] = data?.packages ?? [];
        expect(pkg.name).toBe('org.example:contract-library');
        expect(pkg.versions?.[0].version).toBe('1.0.0');
        expect(pkg.versions?.[0].files).toHaveLength(2);
        expect(typeof pkg.versions?.[0].sizeBytes).toBe('number');
      }),
  );

  it('show-mirror-repository: an npm root’s packages with their dist-tags', () =>
    given(NPM, heldBy(masters, NPM, OPERATIONS[0], REPOSITORY_PACKAGES.consumes)).executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () => REPOSITORY_PACKAGES.fetch(rootOf(NPM)));
        expect(error).toBeUndefined();
        expect(data?.repository?.type).toBe('npm-proxy');
        const [pkg] = data?.packages ?? [];
        expect(pkg.name).toBe('left-pad');
        expect(pkg.versions?.[0].labels).toEqual(['latest']);
      },
    ));

  it.skipIf(!recorded(EMPTY))('show-mirror-repository: a root nobody has pulled through', () =>
    given(EMPTY).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => REPOSITORY_PACKAGES.fetch(rootOf(EMPTY)));
      expect(error).toBeUndefined();
      expect(data?.repository?.name).toBe('hub');
      expect(data?.repository?.evictionWindow).toBe('P30D');
      expect(data?.packages).toEqual([]);
    }),
  );

  it.skipIf(!recorded(ABSENT))('show-mirror-repository: no cache root of that name is a 404', () =>
    given(ABSENT, []).executeTest(async (server) => {
      const { data, response } = await at(server.url, () =>
        REPOSITORY_PACKAGES.fetch(rootOf(ABSENT)),
      );
      expect(data).toBeUndefined();
      expect(response?.status).toBe(404);
    }),
  );
});
