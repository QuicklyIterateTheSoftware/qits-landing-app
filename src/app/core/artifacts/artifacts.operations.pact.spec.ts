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
  ARTIFACT_DAEMON_DOWNLOAD,
  ARTIFACT_DAEMON_VERSIONS,
  ARTIFACT_DAEMONS,
  ARTIFACT_DOCS_SITES,
  ARTIFACT_DOCS_VERSIONS,
  ARTIFACT_IMAGE_MANIFESTS,
  ARTIFACT_IMAGE_TAGS,
  ARTIFACT_IMAGES,
  ARTIFACT_MAVEN_PACKAGES,
  ARTIFACT_MAVEN_VERSIONS,
  ARTIFACT_NPM_PACKAGES,
  ARTIFACT_NPM_VERSIONS,
  ARTIFACT_RECORDS,
  ARTIFACT_REPOSITORIES,
  ARTIFACT_SBOM,
  ARTIFACT_SBOM_VERSIONS,
  daemonDownloadParams,
} from './artifacts.operations';
import { SBOM_MEDIA_TYPE, sbomParams } from './sbom-download';

/**
 * qits-landing-app's pact with qits-artifacts-service, the store explorer's part (qits-2316):
 * `pacts/qits-landing-app_qits-artifacts-service.json`, shared with the docs store's parts
 * (`core/ui-builder/docs.operations.pact.spec.ts`). This spec owns every interaction of the store
 * repository page's operations (`artifacts.operations.ts`): `listRepositories`, `listImages`,
 * `listNpmPackages`, `listMavenPackages`, `listDaemons`, `listDocsSiteSummaries` and
 * `listArtifactRecords`; the image page's (qits-2324): `listImageTagSummaries` and
 * `listImageManifestSummaries`, with `listImages` read again for the image's own row; the maven
 * package page's (qits-2325): `listMavenVersionSummaries`, `listSbomVersions` and `getSbom`; the
 * daemon page's (qits-2327): `listDaemonVersions` and `getDaemon`; the docs site page's
 * (qits-2328): `listDocsVersionSummaries`; and the npm package page's (qits-2326):
 * `listNpmVersionSummaries`, with `listSbomVersions` and `getSbom` for an npm package.
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
 * The image page's tags and manifests (qits-2324) are one image's (`image` in `imagesRepository`),
 * which no other suite pushes, so the provider records them unfiltered and a populated list binds
 * its recorded count exactly: "a store holding one artifact of every kind" (one tag naming the one
 * manifest) and "an image with a manifest no tag names" (one tag, two manifests, one with no tag;
 * its `listImages` too, which the image page's header reads). The empty store's answers (an image
 * nobody pushed: empty lists) follow the empty listings above and bind the status only, though the
 * provider records them exactly; the page's "no such image" screenshot shows their recorded bodies.
 *
 * The maven package page's reads (qits-2325) are one coordinate's (`mavenPackage` in
 * `mavenRepository`; `packageName` of `packageType` for its SBOMs), which no other suite deploys,
 * so a populated list binds its recorded count exactly: "a store holding one artifact of every
 * kind" (one version, no SBOM: the list answers 404) and "a maven coordinate with an sbom on one of
 * two versions" (two versions, one SBOM, and that SBOM's document). The empty store's versions (a
 * coordinate nobody deployed: an empty list) and every SBOM list's 404 bind the status only. The
 * document is read whole, as text, so its interaction binds the status and the CycloneDX media
 * type, never the bytes.
 *
 * The daemon page's versions (qits-2327) are one daemon's (`daemon` in `repository`), a contract
 * name no other suite publishes and every state cleans up, so both recordings bind exactly: "a
 * daemon with two versions" (2026.2.0, then 2026.1.0, a minute older) and "a daemon nothing has
 * published" (no versions, which is also what an unknown daemon answers). A version's download
 * (`getDaemon`, the daemon wire, no repository segment) is no JSON: it binds the status only.
 *
 * The docs site page's versions (qits-2328) are one site's (`docsSite` in `docsRepository`), the
 * contract site the states publish, so both populated recordings bind exactly: "a store holding
 * one artifact of every kind" (one version on `main`) and "a docs site published by two releases"
 * (two versions whose metadata differ, one never read). "A store with nothing published" (no
 * versions) binds the status only, as the empty listings above.
 *
 * The npm package page's reads (qits-2326) are one package's (`npmPackage` in `npmRepository`;
 * `packageName` of `packageType` for its SBOMs), which every state clears first, so a populated list
 * binds its recorded count exactly: "a store holding one artifact of every kind" (one version,
 * `latest` on it) and "a scoped npm package with an sbom on one of two versions"
 * (`@contract/contract-scoped`: two versions, `latest` and `main` on the newer, one SBOM, and that
 * SBOM's document). The empty store's versions (a package nobody published: an empty list) bind the
 * status only. Neither explorer state records the SBOM list for its npm package: each records it
 * once, for its maven coordinate (a 404, as for the npm package), so the npm page's 404 binds that
 * recording's status only. Every door takes a scoped name, and a maven coordinate, as one encoded
 * segment, as the generated client sends it (`%40contract%2Fcontract-scoped`, `%3A`); the pact
 * records that spelling (qits-2409).
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
/** One image with a tagged manifest and a manifest no tag names (qits-2324). */
const UNTAGGED = 'an image with a manifest no tag names';
/** One maven coordinate with two versions, an SBOM on the newer one (qits-2325). */
const SBOMMED = 'a maven coordinate with an sbom on one of two versions';
/** One daemon with two versions, a minute apart (qits-2327). */
const DAEMON = 'a daemon with two versions';
/** The daemon repository, with no version of the daemon in it (qits-2327). */
const NO_DAEMON = 'a daemon nothing has published';
/** One docs site with two versions from two releases, their metadata differing (qits-2328). */
const TWO_RELEASES = 'a docs site published by two releases';
/** One scoped npm package with two versions, an SBOM on the newer one (qits-2326). */
const SCOPED = 'a scoped npm package with an sbom on one of two versions';

const OPERATIONS: readonly OwnedOperation[] = [
  ARTIFACT_REPOSITORIES,
  ARTIFACT_IMAGES,
  ARTIFACT_NPM_PACKAGES,
  ARTIFACT_MAVEN_PACKAGES,
  ARTIFACT_DAEMONS,
  ARTIFACT_DOCS_SITES,
  ARTIFACT_RECORDS,
  ARTIFACT_IMAGE_TAGS,
  ARTIFACT_IMAGE_MANIFESTS,
  ARTIFACT_MAVEN_VERSIONS,
  ARTIFACT_SBOM_VERSIONS,
  ARTIFACT_SBOM,
  ARTIFACT_DAEMON_VERSIONS,
  ARTIFACT_DAEMON_DOWNLOAD,
  ARTIFACT_DOCS_VERSIONS,
  ARTIFACT_NPM_VERSIONS,
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

/** A state's param (`imagesRepository`, `image`, …), as its `operationId` recording names it. */
const paramOf = (state: string, operationId: string, param: string): string => {
  const params = masters.operation(state, operationId).params as Record<string, string>;
  const value = params[param];
  if (!value) throw new Error(`"${state}" has no ${param}`);
  return value;
};

/** The store repository a state's listing is recorded for (`imagesRepository`, …). */
const repoOf = (state: string, param: string): string => paramOf(state, 'listRepositories', param);

/** The daemon repository and daemon a state's daemon page reads (qits-2327). */
const daemonOf = (state: string) => ({
  repo: paramOf(state, 'listDaemonVersions', 'repository'),
  daemon: paramOf(state, 'listDaemonVersions', 'daemon'),
});

/** The docs repository and site a state's docs site page reads (qits-2328). */
const docsSiteOf = (state: string) => ({
  repo: paramOf(state, 'listDocsVersionSummaries', 'docsRepository'),
  site: paramOf(state, 'listDocsVersionSummaries', 'docsSite'),
});

/** The image repository and image a state's image page reads (qits-2324). */
const imageOf = (state: string, operationId: string) => ({
  repo: paramOf(state, operationId, 'imagesRepository'),
  image: paramOf(state, operationId, 'image'),
});

/** The maven repository and coordinate a state's maven package page reads (qits-2325). */
const coordinateOf = (state: string) => ({
  repo: paramOf(state, 'listMavenVersionSummaries', 'mavenRepository'),
  coordinate: paramOf(state, 'listMavenVersionSummaries', 'mavenPackage'),
});

/** The npm repository and package a state's npm package page reads (qits-2326). */
const npmPackageOf = (state: string) => ({
  repo: paramOf(state, 'listNpmVersionSummaries', 'npmRepository'),
  package: paramOf(state, 'listNpmVersionSummaries', 'npmPackage'),
});

/** The package type and name a state's SBOM list is recorded for (qits-2325). */
const sbomPackageOf = (state: string) => ({
  packageType: paramOf(state, 'listSbomVersions', 'packageType'),
  packageName: paramOf(state, 'listSbomVersions', 'packageName'),
});

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

  it('show-artifact-image: an image’s tags, each naming its manifest', () =>
    given(ARTIFACT_IMAGE_TAGS, STORE, 'show-artifact-image').executeTest(async (server) => {
      const path = imageOf(STORE, 'listImageTagSummaries');
      const { data } = await at(server.url, () => ARTIFACT_IMAGE_TAGS.fetch({ path }));
      const [tag] = data?.tags ?? [];
      expect(tag?.tag).toBeTruthy();
      expect(tag?.digest).toMatch(/^sha256:/);
      expect(typeof tag?.sizeBytes).toBe('number');
      expect(tag?.createdAt).toBeTruthy();
      expect(tag?.accessedAt).toBeNull();
    }));

  it('show-artifact-image: an image’s manifests, each with the tags naming it', () =>
    given(ARTIFACT_IMAGE_MANIFESTS, STORE, 'show-artifact-image').executeTest(async (server) => {
      const path = imageOf(STORE, 'listImageManifestSummaries');
      const { data } = await at(server.url, () => ARTIFACT_IMAGE_MANIFESTS.fetch({ path }));
      const [manifest] = data?.manifests ?? [];
      expect(manifest?.digest).toMatch(/^sha256:/);
      expect(manifest?.mediaType).toBeTruthy();
      expect(manifest?.tags?.length).toBe(1);
    }));

  it('show-artifact-image: an image with a manifest no tag names, in the repository’s images', () =>
    given(ARTIFACT_IMAGES, UNTAGGED, 'show-artifact-image').executeTest(async (server) => {
      const { repo, image } = imageOf(UNTAGGED, 'listImages');
      const { data } = await at(server.url, () => ARTIFACT_IMAGES.fetch({ path: { repo } }));
      const row = (data?.images ?? []).find((entry) => entry.name === image);
      expect(row?.manifestCount).toBeGreaterThan(row?.tagCount ?? 0);
    }));

  it('show-artifact-image: the tags of an image with a manifest no tag names', () =>
    given(ARTIFACT_IMAGE_TAGS, UNTAGGED, 'show-artifact-image').executeTest(async (server) => {
      const path = imageOf(UNTAGGED, 'listImageTagSummaries');
      const { data } = await at(server.url, () => ARTIFACT_IMAGE_TAGS.fetch({ path }));
      expect(data?.tags?.length).toBe(1);
    }));

  it('show-artifact-image: the manifests of an image, one no tag names', () =>
    given(ARTIFACT_IMAGE_MANIFESTS, UNTAGGED, 'show-artifact-image').executeTest(async (server) => {
      const path = imageOf(UNTAGGED, 'listImageManifestSummaries');
      const { data } = await at(server.url, () => ARTIFACT_IMAGE_MANIFESTS.fetch({ path }));
      const manifests = data?.manifests ?? [];
      expect(manifests.length).toBe(2);
      expect(manifests.filter((manifest) => (manifest.tags ?? []).length === 0)).toHaveLength(1);
    }));

  // Status only, as for the empty listings above.
  it('show-artifact-image: the tags of an image nobody pushed', () =>
    given(ARTIFACT_IMAGE_TAGS, EMPTY, 'show-artifact-image', STATUS_ONLY).executeTest(
      async (server) => {
        const path = imageOf(EMPTY, 'listImageTagSummaries');
        const { response, error } = await at(server.url, () => ARTIFACT_IMAGE_TAGS.fetch({ path }));
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));

  it('show-artifact-image: the manifests of an image nobody pushed', () =>
    given(ARTIFACT_IMAGE_MANIFESTS, EMPTY, 'show-artifact-image', STATUS_ONLY).executeTest(
      async (server) => {
        const path = imageOf(EMPTY, 'listImageManifestSummaries');
        const { response, error } = await at(server.url, () =>
          ARTIFACT_IMAGE_MANIFESTS.fetch({ path }),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));

  it('show-maven-package: a coordinate’s one version, with its files', () =>
    given(ARTIFACT_MAVEN_VERSIONS, STORE, 'show-maven-package').executeTest(async (server) => {
      const path = coordinateOf(STORE);
      const { data } = await at(server.url, () => ARTIFACT_MAVEN_VERSIONS.fetch({ path }));
      const [version] = data?.versions ?? [];
      expect(data?.versions?.length).toBe(1);
      expect(version?.version).toBeTruthy();
      expect(version?.files?.length).toBeGreaterThan(0);
      expect(typeof version?.sizeBytes).toBe('number');
      expect(version?.publishedAt).toBeTruthy();
    }));

  // A 404 is an error answer: its status only.
  it('show-maven-package: a coordinate with no SBOM, its SBOM list a 404', () =>
    given(ARTIFACT_SBOM_VERSIONS, STORE, 'show-maven-package', STATUS_ONLY).executeTest(
      async (server) => {
        const path = sbomPackageOf(STORE);
        const { response } = await at(server.url, () => ARTIFACT_SBOM_VERSIONS.fetch({ path }));
        expect(response?.status).toBe(404);
      },
    ));

  it('show-maven-package: a coordinate’s two versions', () =>
    given(ARTIFACT_MAVEN_VERSIONS, SBOMMED, 'show-maven-package').executeTest(async (server) => {
      const path = coordinateOf(SBOMMED);
      const { data } = await at(server.url, () => ARTIFACT_MAVEN_VERSIONS.fetch({ path }));
      expect(data?.versions?.map((version) => version.version)).toHaveLength(2);
    }));

  it('show-maven-package: a coordinate’s SBOMs, one on the newer version', () =>
    given(ARTIFACT_SBOM_VERSIONS, SBOMMED, 'show-maven-package').executeTest(async (server) => {
      const path = sbomPackageOf(SBOMMED);
      const { data } = await at(server.url, () => ARTIFACT_SBOM_VERSIONS.fetch({ path }));
      const [sbom] = data?.versions ?? [];
      expect(data?.versions?.length).toBe(1);
      expect(sbom?.version).toBe(paramOf(SBOMMED, 'getSbom', 'version'));
      expect(sbom?.specVersion).toBeTruthy();
      expect(typeof sbom?.sizeBytes).toBe('number');
      expect(sbom?.createdAt).toBeTruthy();
    }));

  // Status only, as for the empty listings above.
  it('show-maven-package: the versions of a coordinate nobody deployed', () =>
    given(ARTIFACT_MAVEN_VERSIONS, EMPTY, 'show-maven-package', STATUS_ONLY).executeTest(
      async (server) => {
        const path = coordinateOf(EMPTY);
        const { response, error } = await at(server.url, () =>
          ARTIFACT_MAVEN_VERSIONS.fetch({ path }),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));

  it('show-artifact-daemon: a daemon’s two versions', () =>
    given(ARTIFACT_DAEMON_VERSIONS, DAEMON, 'show-artifact-daemon').executeTest(async (server) => {
      const path = daemonOf(DAEMON);
      const { data } = await at(server.url, () => ARTIFACT_DAEMON_VERSIONS.fetch({ path }));
      const versions = data?.versions ?? [];
      // Bound at its recorded count; each version by its type, as the matchers read it.
      expect(versions).toHaveLength(2);
      const [newest] = versions;
      expect(newest?.digest).toMatch(/^sha256:/);
      expect(typeof newest?.sizeBytes).toBe('number');
      expect(newest?.publishedAt).toBeTruthy();
      expect(newest?.accessedAt).toBeNull();
    }));

  it('show-artifact-daemon: a daemon nothing has published, no versions', () =>
    given(ARTIFACT_DAEMON_VERSIONS, NO_DAEMON, 'show-artifact-daemon').executeTest(
      async (server) => {
        const path = daemonOf(NO_DAEMON);
        const { data } = await at(server.url, () => ARTIFACT_DAEMON_VERSIONS.fetch({ path }));
        expect(data?.versions).toEqual([]);
      },
    ));

  it('download-artifact-daemon: a daemon version’s bytes, on the daemon wire', () =>
    given(ARTIFACT_DAEMON_DOWNLOAD, DAEMON, 'download-artifact-daemon').executeTest(
      async (server) => {
        const params = masters.operation(DAEMON, 'getDaemon').params as Record<string, string>;
        const { response, error } = await at(server.url, () =>
          ARTIFACT_DAEMON_DOWNLOAD.fetch(daemonDownloadParams(params['daemon'], params['version'])),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));

  it('show-maven-package: the SBOM list of a coordinate nobody deployed, a 404', () =>
    given(ARTIFACT_SBOM_VERSIONS, EMPTY, 'show-maven-package', STATUS_ONLY).executeTest(
      async (server) => {
        const path = sbomPackageOf(EMPTY);
        const { response } = await at(server.url, () => ARTIFACT_SBOM_VERSIONS.fetch({ path }));
        expect(response?.status).toBe(404);
      },
    ));

  it('download-maven-sbom: a version’s CycloneDX document', () => {
    if (ARTIFACT_SBOM.provider !== PROVIDER) throw new Error('getSbom is not the artifacts one');
    return addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: SBOMMED,
      operationId: ARTIFACT_SBOM.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'download-maven-sbom' },
      consumes: ARTIFACT_SBOM.consumes,
      response: { contentType: SBOM_MEDIA_TYPE },
    }).executeTest(async (server) => {
      const { packageType, packageName } = sbomPackageOf(SBOMMED);
      const version = paramOf(SBOMMED, 'getSbom', 'version');
      const { response, error } = await at(server.url, () =>
        ARTIFACT_SBOM.fetch(sbomParams(packageType, packageName, version)),
      );
      expect(error).toBeUndefined();
      expect(response?.status).toBe(200);
    });
  });

  it('show-artifact-docs-site: a docs site’s one version', () =>
    given(ARTIFACT_DOCS_VERSIONS, STORE, 'show-artifact-docs-site').executeTest(async (server) => {
      const path = docsSiteOf(STORE);
      const { data } = await at(server.url, () => ARTIFACT_DOCS_VERSIONS.fetch({ path }));
      const versions = data?.versions ?? [];
      expect(versions).toHaveLength(1);
      const [version] = versions;
      expect(version?.version).toBeTruthy();
      expect(typeof version?.fileCount).toBe('number');
      expect(typeof version?.sizeBytes).toBe('number');
      expect(version?.publishedAt).toBeTruthy();
      expect(version?.accessedAt).toBeNull();
      expect(version?.metadata?.['git.branch.name']).toBeTruthy();
    }));

  it('show-artifact-docs-site: a docs site published by two releases', () =>
    given(ARTIFACT_DOCS_VERSIONS, TWO_RELEASES, 'show-artifact-docs-site').executeTest(
      async (server) => {
        const path = docsSiteOf(TWO_RELEASES);
        const { data } = await at(server.url, () => ARTIFACT_DOCS_VERSIONS.fetch({ path }));
        const [newest, older] = data?.versions ?? [];
        expect(data?.versions).toHaveLength(2);
        expect(newest?.accessedAt).toBeNull();
        expect(newest?.metadata?.['git.branch.name']).toBeTruthy();
        expect(older?.accessedAt).toBeTruthy();
        expect(older?.metadata?.['release.request.qualified-id']).toBeTruthy();
        expect(older?.metadata?.['git.branch.name']).toBeUndefined();
      },
    ));

  // Status only, as for the empty listings above.
  it('show-artifact-docs-site: a docs site nothing has published', () =>
    given(ARTIFACT_DOCS_VERSIONS, EMPTY, 'show-artifact-docs-site', STATUS_ONLY).executeTest(
      async (server) => {
        const path = docsSiteOf(EMPTY);
        const { response, error } = await at(server.url, () =>
          ARTIFACT_DOCS_VERSIONS.fetch({ path }),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));
  it('show-npm-package: a package’s one version, with its dist-tag', () =>
    given(ARTIFACT_NPM_VERSIONS, STORE, 'show-npm-package').executeTest(async (server) => {
      const path = npmPackageOf(STORE);
      const { data } = await at(server.url, () => ARTIFACT_NPM_VERSIONS.fetch({ path }));
      const [version] = data?.versions ?? [];
      expect(data?.versions?.length).toBe(1);
      expect(version?.version).toBeTruthy();
      expect(typeof version?.tarballSizeBytes).toBe('number');
      expect(version?.publishedAt).toBeTruthy();
      expect(version?.distTags).toHaveLength(1);
    }));

  // A 404 is an error answer: its status only. The state records the SBOM list once, for its maven
  // coordinate, so the interaction reads that one; the npm package has none either, and answers
  // the same 404.
  it('show-npm-package: a package with no SBOM, its SBOM list a 404', () =>
    given(ARTIFACT_SBOM_VERSIONS, STORE, 'show-npm-package', STATUS_ONLY).executeTest(
      async (server) => {
        // The recorded path: the pact matches its encoded spelling exactly (qits-2409).
        const path = sbomPackageOf(STORE);
        const { response } = await at(server.url, () => ARTIFACT_SBOM_VERSIONS.fetch({ path }));
        expect(response?.status).toBe(404);
      },
    ));

  it('show-npm-package: a scoped package’s two versions, the dist-tags on the newer', () =>
    given(ARTIFACT_NPM_VERSIONS, SCOPED, 'show-npm-package').executeTest(async (server) => {
      const path = npmPackageOf(SCOPED);
      expect(path.package).toMatch(/^@[^/]+\/.+/);
      const { data } = await at(server.url, () => ARTIFACT_NPM_VERSIONS.fetch({ path }));
      const versions = data?.versions ?? [];
      expect(versions).toHaveLength(2);
      const tagged = versions.find((version) => (version.distTags ?? []).length > 0);
      // Bound at its recorded count (`latest` and `main`), each tag by its type.
      expect(tagged?.distTags).toHaveLength(2);
    }));

  it('show-npm-package: a scoped package’s SBOMs, one on the newer version', () =>
    given(ARTIFACT_SBOM_VERSIONS, SCOPED, 'show-npm-package').executeTest(async (server) => {
      const path = sbomPackageOf(SCOPED);
      expect(path.packageType).toBe('npm');
      const { data } = await at(server.url, () => ARTIFACT_SBOM_VERSIONS.fetch({ path }));
      const [sbom] = data?.versions ?? [];
      expect(data?.versions?.length).toBe(1);
      expect(sbom?.version).toBe(paramOf(SCOPED, 'getSbom', 'version'));
      expect(sbom?.specVersion).toBeTruthy();
      expect(typeof sbom?.sizeBytes).toBe('number');
      expect(sbom?.createdAt).toBeTruthy();
    }));

  // Status only, as for the empty listings above.
  it('show-npm-package: the versions of a package nobody published', () =>
    given(ARTIFACT_NPM_VERSIONS, EMPTY, 'show-npm-package', STATUS_ONLY).executeTest(
      async (server) => {
        const path = npmPackageOf(EMPTY);
        const { response, error } = await at(server.url, () =>
          ARTIFACT_NPM_VERSIONS.fetch({ path }),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));

  it('show-npm-package: the SBOM list of a package nobody published, a 404', () =>
    given(ARTIFACT_SBOM_VERSIONS, EMPTY, 'show-npm-package', STATUS_ONLY).executeTest(
      async (server) => {
        // The recorded path: the pact matches its encoded spelling exactly (qits-2409).
        const path = sbomPackageOf(EMPTY);
        const { response } = await at(server.url, () => ARTIFACT_SBOM_VERSIONS.fetch({ path }));
        expect(response?.status).toBe(404);
      },
    ));

  it('download-npm-sbom: a version’s CycloneDX document, the scoped name encoded', () => {
    if (ARTIFACT_SBOM.provider !== PROVIDER) throw new Error('getSbom is not the artifacts one');
    return addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: SCOPED,
      operationId: ARTIFACT_SBOM.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'download-npm-sbom' },
      consumes: ARTIFACT_SBOM.consumes,
      response: { contentType: SBOM_MEDIA_TYPE },
    }).executeTest(async (server) => {
      const { packageType, packageName } = sbomPackageOf(SCOPED);
      const version = paramOf(SCOPED, 'getSbom', 'version');
      const { response, error } = await at(server.url, () =>
        ARTIFACT_SBOM.fetch(sbomParams(packageType, packageName, version)),
      );
      expect(error).toBeUndefined();
      expect(response?.status).toBe(200);
    });
  });
});
