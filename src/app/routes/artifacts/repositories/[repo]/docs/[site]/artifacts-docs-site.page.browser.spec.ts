import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { QITS_LEAVE_APP } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';

const STORE = 'a store holding one artifact of every kind';
const TWO_RELEASES = 'a docs site published by two releases';
const NOTHING_PUBLISHED = 'a store with nothing published';
const ARTIFACTS = 'qits-artifacts';

/** The docs site every state records (`docsSite` in `docsRepository`). */
const REPO = 'docs';
const SITE = 'contract-docs-site';
/** A scoped, slashed site name, as every live site's is. */
const SLASHED = '@changelog/qits-qits';

/** qits-docs' page origin, where a version's Read leads. */
const DOCS = 'https://docs.qits.example.test';

/**
 * Screenshots of the Artifacts section's docs site page (qits-2328) inside the shell (`openRoute`),
 * with no project open, its one read (`listDocsVersionSummaries`) answered with qits-artifacts'
 * recordings: "a store holding one artifact of every kind" (`contract-docs-site` in `docs`, one
 * version on `main`; `site`), "a docs site published by two releases" (the same site, a version
 * with a branch and never read above one without a branch that was read; `two-releases`) and "a
 * store with nothing published" (no versions, as an unknown site answers too; `empty`). A 404
 * (`unknown-repository`), a 400 (`not-a-docs-repository`), a read still open (`loading`) and a
 * failure (`error`) are statuses only.
 *
 * Its outcomes (epic qits-2000) are each reached once: the back link and a non-docs repository's
 * store page (`leave-artifact-docs-site`), and a version's Read, which leaves for qits-docs' reader
 * (`read-artifact-docs-version`; `QITS_LEAVE_APP` is a spy, so the tab stays). The platform origins
 * are `provideAppRoute()`'s, with the docs app's added.
 */
describe('ArtifactsDocsSitePage (screenshots)', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    leave = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins(
          {},
          {
            idp: 'https://idp.qits.example.test',
            artifacts: 'https://registry.qits.example.test',
            'network-access': 'https://network-access.qits.example.test',
            docs: DOCS,
          },
        ),
        { provide: QITS_LEAVE_APP, useValue: leave },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The page's read, by URL: the site one segment, `%2F` and `%40` encoded. */
  const versionsUrl = (repo: string, site = SITE) =>
    `/artifacts/api/repositories/${encodeURIComponent(repo)}/docs/${encodeURIComponent(site)}/versions`;

  /** Opens the site's page, its read still open. */
  async function open(repo = REPO, site = SITE): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute(
      `/artifacts/repositories/${encodeURIComponent(repo)}/docs/${encodeURIComponent(site)}`,
    );
  }

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string, repo = REPO, site = SITE) {
    http
      .expectOne(versionsUrl(repo, site))
      .flush(await goldenMaster(state, 'listDocsVersionSummaries', ARTIFACTS));
    await opened.settled();
  }

  /** Answers the read with `status` and no body (an error answer is only a status). */
  async function refuse(opened: OpenedRoute, status: number, statusText: string, repo = REPO) {
    http.expectOne(versionsUrl(repo)).flush(null, { status, statusText });
    await opened.settled();
  }

  /** The site's page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('shows a docs site’s version, with its files, size and where it came from', async () => {
    const { opened, view } = await render(STORE);
    await expect.element(view.getByRole('heading', { name: SITE, exact: true })).toBeVisible();
    await expect.element(view).toMatchTextContent('1 version · newest first');
    const versions = view.getByRole('table', { name: 'Versions' });
    const rows = versions.getByRole('row').elements();
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('2100.1.0');
    expect(rows[1].textContent).toContain('44 B');
    expect(rows[1].textContent).toContain('1 Jan 2026 00:00:00Z');
    expect(rows[1].textContent).toContain('Never');
    // Only a branch is recorded: the line names it alone.
    expect(rows[1].textContent).toContain('main');
    await expect.element(view).toMatchTextContent('the sizes do not add up');
    await expect
      .element(view.getByRole('link', { name: `Read ${SITE} version 2100.1.0` }))
      .toHaveAttribute('href', `${DOCS}/read/${SITE}/-/2100.1.0`);
    // The root sidebar's Artifacts stays current below the section.
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
      .toMatchScreenshot('site', { kind: 'DATA' });
    await shootShellMenus(opened, 'site');
  });

  it('shows two releases newest first, each published from its own commit', async () => {
    const { opened, view } = await render(TWO_RELEASES);
    await expect.element(view).toMatchTextContent('2 versions · newest first');
    const rows = view.getByRole('table', { name: 'Versions' }).getByRole('row').elements();
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('2100.2.0');
    expect(rows[1].textContent).toContain(
      'contract-repository · main · bbbbbbb · qits-contract-rr-2',
    );
    expect(rows[1].textContent).toContain('Never');
    expect(rows[2].textContent).toContain('2100.1.0');
    expect(rows[2].textContent).toContain('contract-repository · aaaaaaa · qits-contract-rr-1');
    expect(rows[2].textContent).not.toContain('Never');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('two-releases', { kind: 'DATA' });
  });

  it('says there is no such site when the read lists no versions', async () => {
    const { opened, view } = await render(NOTHING_PUBLISHED);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent(`There is no site called “${SITE}” in this repository.`);
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('reads a slashed site name as one segment', async () => {
    const opened = await open(REPO, SLASHED);
    expect(TestBed.inject(Router).url).toBe(
      '/artifacts/repositories/docs/docs/@changelog%2Fqits-qits',
    );
    // The read carries the site encoded: this /artifacts/api/ door is no docs wire URL.
    await answer(opened, NOTHING_PUBLISHED, REPO, SLASHED);
    expect(versionsUrl(REPO, SLASHED)).toBe(
      '/artifacts/api/repositories/docs/docs/%40changelog%2Fqits-qits/versions',
    );
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: SLASHED, exact: true })).toBeVisible();
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent(`There is no site called “${SLASHED}” in this repository.`);
  });

  it('says so when the store holds no repository of that name', async () => {
    const opened = await open('no-such-store');
    await refuse(opened, 404, 'Not Found', 'no-such-store');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('There is no repository called “no-such-store” in this store.');
    expect(opened.page.textContent).not.toContain('could not be read');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown-repository', { kind: 'NO_DATA' });
  });

  it('says a repository of another type is not a docs repository, linking its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('“npm” is not a docs repository.');
    await expect
      .element(view.getByRole('link', { name: 'Open its store page' }))
      .toHaveAttribute('href', '/artifacts/repositories/npm');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-a-docs-repository', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    await refuse(opened, 500, 'Server Error');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchTextContent('This docs site’s versions could not be read.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, TWO_RELEASES);
    await expect
      .element(view.getByRole('table', { name: 'Versions' }))
      .toMatchTextContent('2100.2.0');
  });

  it('reads the versions again on Refresh', async () => {
    const { opened, view } = await render(TWO_RELEASES);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, TWO_RELEASES);
  });

  it('read-artifact-docs-version read: a version opens in qits-docs’ reader', async () => {
    const { view } = await render(TWO_RELEASES);
    const href = `${DOCS}/read/${SITE}/-/2100.2.0`;
    const link = view.getByRole('link', { name: `Read ${SITE} version 2100.2.0` });
    await expect.element(link).toHaveAttribute('href', href);
    await userEvent.click(link);
    expect(reached()).toEqual(['read-artifact-docs-version:read']);
    expect(leave).toHaveBeenCalledWith(href);
    expect(TestBed.inject(Router).url).toBe(`/artifacts/repositories/${REPO}/docs/${SITE}`);
  });

  it('leave-artifact-docs-site back: the back link opens the repository’s page', async () => {
    const { opened, view } = await render(TWO_RELEASES);
    await view.getByRole('link', { name: `← ${REPO}` }).click();
    await opened.settled();
    expect(reached()).toEqual(['leave-artifact-docs-site:back']);
    expect(TestBed.inject(Router).url).toBe(`/artifacts/repositories/${REPO}`);
    http
      .expectOne('/artifacts/api/repositories')
      .flush(await goldenMaster(STORE, 'listRepositories', ARTIFACTS));
    await opened.settled();
    http
      .expectOne(`/artifacts/api/repositories/${REPO}/docs`)
      .flush(await goldenMaster(STORE, 'listDocsSiteSummaries', ARTIFACTS));
    await opened.settled();
  });

  it('leave-artifact-docs-site repository: a non-docs repository’s note opens its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'Open its store page' })
      .click();
    await opened.settled();
    expect(reached()).toEqual(['leave-artifact-docs-site:repository']);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/npm');
    http
      .expectOne('/artifacts/api/repositories')
      .flush(await goldenMaster(STORE, 'listRepositories', ARTIFACTS));
    await opened.settled();
    http
      .expectOne('/artifacts/api/repositories/npm/packages')
      .flush(await goldenMaster(STORE, 'listNpmPackages', ARTIFACTS));
    await opened.settled();
  });
});
