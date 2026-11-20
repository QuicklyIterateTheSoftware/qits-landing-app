import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { QITS_LEAVE_APP } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const STORE = 'a store holding one artifact of every kind';
const EMPTY = 'a store with nothing published';
const ARTIFACTS = 'qits-artifacts';
/** The old explorer's page origin, as `provideAppRoute()` gives it. */
const OLD_EXPLORER = 'https://registry.qits.example.test';

/** Each store repository the recordings seed, the listing its type reads, and what that lists. */
const LISTINGS = {
  qits: { path: 'images', operationId: 'listImages', table: 'Images' },
  npm: { path: 'packages', operationId: 'listNpmPackages', table: 'Packages' },
  maven: { path: 'maven-packages', operationId: 'listMavenPackages', table: 'Maven coordinates' },
  daemons: { path: 'daemons', operationId: 'listDaemons', table: 'Daemons' },
  docs: { path: 'docs', operationId: 'listDocsSiteSummaries', table: 'Documentation sites' },
} as const;
type Listed = keyof typeof LISTINGS;

/**
 * Screenshots of the Artifacts section's store repository page (qits-2316) inside the shell
 * (`openRoute`), with no project open, answered with qits-artifacts' recordings: "a store holding
 * one artifact of every kind" (the seeded repositories, and one image in `qits`, one npm package
 * in `npm`, one coordinate in `maven`, one daemon in `daemons` and one site in `docs`; `images`,
 * `npm`, `maven`, `daemons`, `docs`), "a store with nothing published" (`qits` holding no image;
 * `empty`), a name the store does not hold (`unknown-repository`), `sboms`, whose type has no
 * listing (`no-listing`, one request in all), and a read still open (`loading`) or refused
 * (`error`).
 *
 * Its exits (epic qits-2000) are each followed once: a store repository in the switcher
 * (`switch-artifacts-repository`), an image row, which opens the image's page here
 * (`open-artifact-image`, qits-2324), a maven row, which opens the coordinate's page here
 * (`open-maven-package`, qits-2325), a daemon row, which opens the daemon's page here
 * (`open-artifact-daemon`, qits-2327), a docs site row, which opens the site's page here
 * (`open-artifact-docs-site`, qits-2328), an npm row, which still leaves for the old explorer
 * until qits-2326 (`open-artifacts-entry`; `QITS_LEAVE_APP` is a spy, so the tab stays), and
 * Cleanup, which opens the repository's cleanup page here (`open-artifacts-cleanup`, qits-2329).
 */
describe('ArtifactsRepositoryPage (screenshots)', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    leave = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideAppRoute(), { provide: QITS_LEAVE_APP, useValue: leave }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Answers the repositories' read in `state`. */
  async function answerRepositories(state: string) {
    http
      .expectOne('/artifacts/api/repositories')
      .flush(await goldenMaster(state, 'listRepositories', ARTIFACTS));
  }

  /** Opens `repo`'s page with the repositories and, for a listed type, its listing in `state`. */
  async function open(repo: string, state = STORE): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    const opened = await openRoute(`/artifacts/repositories/${repo}`);
    await answerRepositories(state);
    await opened.settled();
    const listing = LISTINGS[repo as Listed];
    if (listing) {
      http
        .expectOne(`/artifacts/api/repositories/${repo}/${listing.path}`)
        .flush(await goldenMaster(state, listing.operationId, ARTIFACTS));
      await opened.settled();
    }
    return opened;
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('lists the image store’s images under its name, type and size', async () => {
    const opened = await open('qits');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: 'qits', exact: true })).toBeVisible();
    await expect.element(view).toMatchTextContent('oci-images');
    await expect.element(view).toMatchTextContent('0 images · 0 B');
    const table = view.getByRole('table', { name: 'Images' });
    await expect.element(table).toMatchTextContent('contract-image');
    await expect.element(table).toMatchTextContent('1 tag · 1 manifest');
    await expect.element(table).toMatchTextContent('2.57 KiB');
    // Every store repository in the switcher, from the same answer; the open one current.
    const switcher = view.getByRole('navigation', { name: 'Store repositories' });
    expect(
      switcher
        .getByRole('link')
        .elements()
        .map((link) => link.textContent?.trim()),
    ).toEqual(['ci-screenshots', 'ci-videos', 'daemons', 'docs', 'maven', 'npm', 'qits', 'sboms']);
    await expect
      .element(switcher.getByRole('link', { name: 'qits' }))
      .toHaveAttribute('aria-current', 'page');
    // The root sidebar's Artifacts is current on the section's pages.
    await expect
      .element(
        page
          .elementLocator(opened.frame)
          .getByRole('navigation', { name: 'qits' })
          .getByRole('link', { name: 'Artifacts' }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('images', { kind: 'DATA' });
    await shootShellMenus(opened, 'images');
  });

  for (const [repo, name, table, text] of [
    ['npm', 'npm', 'Packages', 'contract-package'],
    ['maven', 'maven', 'Maven coordinates', 'eu.wohlben.qits:contract-maven'],
    ['daemons', 'daemons', 'Daemons', '2026.2.0 · 1 Jan 2026 00:00:00Z'],
    ['docs', 'docs', 'Documentation sites', 'contract-docs-site'],
  ] as const) {
    it(`lists the ${repo} store’s own kind of entry`, async () => {
      const opened = await open(repo);
      const view = page.elementLocator(opened.page);
      await expect.element(view.getByRole('table', { name: table })).toMatchTextContent(text);
      await expect
        .element(page.elementLocator(opened.frame))
        .toMatchScreenshot(name, { kind: 'DATA' });
    });
  }

  it('narrows the rows by name, and says so when none matches', async () => {
    const opened = await open('qits');
    const view = page.elementLocator(opened.page);
    const search = view.getByRole('searchbox', { name: 'Search images' });
    await userEvent.fill(search, 'CONTRACT');
    await opened.settled();
    expect(view.getByRole('table', { name: 'Images' }).getByRole('row').elements()).toHaveLength(2);
    await userEvent.fill(search, 'nothing-like-it');
    await opened.settled();
    expect(view.getByRole('table', { name: 'Images' }).getByRole('row').elements()).toHaveLength(1);
    await expect.element(view).toMatchTextContent('No images match “nothing-like-it”.');
  });

  it('says so when the repository holds nothing', async () => {
    const opened = await open('qits', EMPTY);
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('This repository holds no images.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says so when the store holds no repository of that name, and reads nothing else', async () => {
    const opened = await open('no-such-store');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('There is no repository called “no-such-store” in this store.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown-repository', { kind: 'NO_DATA' });
  });

  it('makes no second request for a type without a listing', async () => {
    const opened = await open('sboms');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('sboms');
    await expect
      .element(view)
      .toMatchTextContent('This repository’s type has no listing here yet.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-listing', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    await page.viewport(1140, 900);
    const opened = await openRoute('/artifacts/repositories/qits');
    const read = http.expectOne('/artifacts/api/repositories');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });

  it('reads the repositories and the listing again on Refresh', async () => {
    const opened = await open('qits');
    await page.elementLocator(opened.page).getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerRepositories(STORE);
    http
      .expectOne('/artifacts/api/repositories/qits/images')
      .flush(await goldenMaster(STORE, 'listImages', ARTIFACTS));
    await opened.settled();
  });

  it('opens the image store at /artifacts', async () => {
    await page.viewport(1140, 900);
    const opened = await openRoute('/artifacts');
    await answerRepositories(STORE);
    await opened.settled();
    http
      .expectOne('/artifacts/api/repositories/qits/images')
      .flush(await goldenMaster(STORE, 'listImages', ARTIFACTS));
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/qits');
  });

  it('switch-artifacts-repository repository: a store repository in the switcher opens its page', async () => {
    const opened = await open('qits');
    await page
      .elementLocator(opened.page)
      .getByRole('navigation', { name: 'Store repositories' })
      .getByRole('link', { name: 'npm' })
      .click();
    await opened.settled();
    // The repositories are not read again: the one answer already lists every repository.
    http
      .expectOne('/artifacts/api/repositories/npm/packages')
      .flush(await goldenMaster(STORE, 'listNpmPackages', ARTIFACTS));
    await opened.settled();
    expect(reached()).toEqual(['switch-artifacts-repository:repository']);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/npm');
    await expect
      .element(page.elementLocator(opened.page).getByRole('table', { name: 'Packages' }))
      .toMatchTextContent('contract-package');
  });

  it('open-artifact-image image: an image row opens the image’s page here', async () => {
    const opened = await open('qits');
    const link = page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'contract-image', exact: true });
    await expect
      .element(link)
      .toHaveAttribute('href', '/artifacts/repositories/qits/images/contract-image');
    await userEvent.click(link);
    await opened.settled();
    expect(reached()).toEqual(['open-artifact-image:image']);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/qits/images/contract-image');
    expect(leave).not.toHaveBeenCalled();
    // The image page's reads, answered as its own spec does.
    const at = '/artifacts/api/repositories/qits/images';
    http.expectOne(at).flush(await goldenMaster(STORE, 'listImages', ARTIFACTS));
    http
      .expectOne(`${at}/contract-image/tags`)
      .flush(await goldenMaster(STORE, 'listImageTagSummaries', ARTIFACTS));
    http
      .expectOne(`${at}/contract-image/manifests`)
      .flush(await goldenMaster(STORE, 'listImageManifestSummaries', ARTIFACTS));
    await opened.settled();
  });

  it('open-maven-package mavenPackage: a coordinate row opens the coordinate’s page here', async () => {
    const opened = await open('maven');
    const coordinate = 'eu.wohlben.qits:contract-maven';
    const link = page
      .elementLocator(opened.page)
      .getByRole('link', { name: coordinate, exact: true });
    await expect
      .element(link)
      .toHaveAttribute('href', `/artifacts/repositories/maven/maven-packages/${coordinate}`);
    await userEvent.click(link);
    await opened.settled();
    expect(reached()).toEqual(['open-maven-package:mavenPackage']);
    expect(TestBed.inject(Router).url).toBe(
      `/artifacts/repositories/maven/maven-packages/${coordinate}`,
    );
    expect(leave).not.toHaveBeenCalled();
    // The coordinate page's reads, answered as its own spec does (no SBOM: a 404).
    const encoded = encodeURIComponent(coordinate);
    http
      .expectOne(`/artifacts/api/repositories/maven/maven-packages/${encoded}/versions`)
      .flush(await goldenMaster(STORE, 'listMavenVersionSummaries', ARTIFACTS));
    http
      .expectOne(`/artifacts/sboms/maven/${encoded}`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
  });

  it('open-artifacts-cleanup cleanup: Cleanup opens the repository’s cleanup page here', async () => {
    const opened = await open('daemons');
    const link = page.elementLocator(opened.page).getByRole('link', { name: 'Cleanup →' });
    await expect.element(link).toHaveAttribute('href', '/artifacts/repositories/daemons/cleanup');
    await userEvent.click(link);
    await opened.settled();
    expect(reached()).toEqual(['open-artifacts-cleanup:cleanup']);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/daemons/cleanup');
    // The cleanup page's one read, answered as its own spec does.
    http
      .expectOne('/orchestrator/api/artifacts/repositories/daemons/plan')
      .flush(
        await goldenMaster(
          'a repository the cleanup can plan',
          'planArtifactsCleanupRepository',
          'qits-orchestrator',
        ),
      );
    await opened.settled();
  });

  it('open-artifact-daemon daemon: a daemon row opens the daemon’s page here', async () => {
    const opened = await open('daemons');
    const link = page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'contract-daemon', exact: true });
    await expect
      .element(link)
      .toHaveAttribute('href', '/artifacts/repositories/daemons/daemons/contract-daemon');
    await userEvent.click(link);
    await opened.settled();
    expect(reached()).toEqual(['open-artifact-daemon:daemon']);
    expect(TestBed.inject(Router).url).toBe(
      '/artifacts/repositories/daemons/daemons/contract-daemon',
    );
    expect(leave).not.toHaveBeenCalled();
    // The daemon page's read, answered as its own spec does (the same daemon in the same store).
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/contract-daemon/versions')
      .flush(await goldenMaster('a daemon with two versions', 'listDaemonVersions', ARTIFACTS));
    await opened.settled();
  });

  it('open-artifact-docs-site site: a docs site row opens the site’s page here', async () => {
    const opened = await open('docs');
    const link = page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'contract-docs-site', exact: true });
    await expect
      .element(link)
      .toHaveAttribute('href', '/artifacts/repositories/docs/docs/contract-docs-site');
    await userEvent.click(link);
    await opened.settled();
    expect(reached()).toEqual(['open-artifact-docs-site:site']);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/docs/docs/contract-docs-site');
    expect(leave).not.toHaveBeenCalled();
    // The docs site page's read, answered as its own spec does (the same site in the same store).
    http
      .expectOne('/artifacts/api/repositories/docs/docs/contract-docs-site/versions')
      .flush(await goldenMaster(STORE, 'listDocsVersionSummaries', ARTIFACTS));
    await opened.settled();
  });

  it('open-artifacts-entry npmPackage: an npm row leaves for its page in the old explorer', async () => {
    const opened = await open('npm');
    const href = `${OLD_EXPLORER}/repositories/npm/packages/contract-package`;
    const link = page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'contract-package', exact: true });
    await expect.element(link).toHaveAttribute('href', href);
    await userEvent.click(link);
    expect(reached()).toEqual(['open-artifacts-entry:npmPackage']);
    expect(leave).toHaveBeenCalledWith(href);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/npm');
  });
});
