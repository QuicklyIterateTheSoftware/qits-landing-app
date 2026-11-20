import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const REPOSITORIES = 'two projects exist';
const EVERY_KIND = 'a docs catalog of every kind';
/** A few days after the recorded catalog's newest publication, so "how long ago" is stable. */
const NOW = new Date('2026-01-20T00:00:00Z');

/**
 * Screenshots of a repository's Docs page (qits-2336) inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists"), its repositories answered with
 * qits-projects' "two projects exist" (`qits-ci-service`, `qits-ci-frontend` and the wrapper) and
 * the catalog with qits-artifacts' "a docs catalog of every kind", whose newest versions name their
 * repositories (`latestRepository`): `qits-ci-service` published three sites in three sections
 * (`@apidocs/qits-ci`, `@contracts/qits-ci`, `@changelog/qits-ci-service`; `populated`, and
 * `filtered` at `?section=contracts`), `qits-ci-frontend` none (`empty`); a name the project does
 * not hold (`unknown`); a read still open (`loading`) or failed (`error`). The two providers' ids
 * are unrelated: the repositories are answered under the open project's id.
 *
 * Its exits are followed once each: a row opens the site's reader in this app (`open-docs-site`
 * `open`, qits-2337), and “← Docs” goes back to the project's Docs page (`leave-repository-docs`
 * `docs`).
 */
describe('RepositoryDocsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [provideAppRoute()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of `repo` at `query`, its reads still open. */
  async function open(repo: string, query = '') {
    await page.viewport(1140, 900);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/docs/repositories/${repo}${query}`,
    );
    return {
      opened,
      repositories: (): TestRequest =>
        http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`),
      catalog: (): TestRequest => http.expectOne('/artifacts/docs/docs'),
    };
  }

  /** `repo`'s page at `query`, both reads answered from the recordings. */
  async function render(repo: string, query = ''): Promise<OpenedRoute> {
    const reads = await open(repo, query);
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    reads.catalog().flush(await goldenMaster(EVERY_KIND, 'listDocsSites', 'qits-artifacts'));
    await reads.opened.settled();
    return reads.opened;
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's. Answers in rounds,
   * until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  /** The blocks the page shows, each with its sites' short names, in its order. */
  const shown = (opened: OpenedRoute) =>
    [...opened.page.querySelectorAll('section')].map((section) => [
      section.querySelector('h2')?.textContent?.trim(),
      [...section.querySelectorAll('li a > span:first-child')].map((s) => s.textContent?.trim()),
    ]);

  it('lists the sites the repository published, by section, whatever their names', async () => {
    const opened = await render('qits-ci-service');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('qits-ci-service');
    await expect
      .element(view)
      .toMatchTextContent('Docs sites whose newest version this repository published');
    expect(shown(opened)).toEqual([
      ['API docs', ['qits-ci']],
      ['Contracts', ['qits-ci']],
      ['Changelogs', ['qits-ci-service']],
    ]);
    const apidocs = view.getByRole('list', { name: 'API docs' }).getByRole('listitem');
    await expect.element(apidocs).toMatchTextContent('@apidocs/qits-ci');
    await expect.element(apidocs).toMatchTextContent('2026.112.10000');
    await expect.element(apidocs).toMatchTextContent('3 versions');
    await expect
      .element(apidocs.getByRole('link'))
      .toHaveAttribute('href', `/projects/${opened.project.slug}/docs/read/@apidocs%2Fqits-ci`);
    // The sidebar's Docs entry stays current below it.
    await expect
      .element(page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Docs' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('populated', { kind: 'DATA' });
    await shootShellMenus(opened, 'populated');
  });

  it('keeps one section alone at ?section=', async () => {
    const opened = await render('qits-ci-service', '?section=contracts');
    expect(shown(opened)).toEqual([['Contracts', ['qits-ci']]]);
    await expect
      .element(page.elementLocator(opened.page).getByRole('link', { name: /^Contracts/ }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('filtered', { kind: 'DATA' });
  });

  it('ignores a ?section= naming no section', async () => {
    const opened = await render('qits-ci-service', '?section=nonsense');
    expect(shown(opened)).toHaveLength(3);
  });

  it('says when the repository has no site in ?section=, and clears it', async () => {
    const opened = await render('qits-ci-service', '?section=guides');
    const view = page.elementLocator(opened.page);
    expect(shown(opened)).toEqual([]);
    await expect.element(view).toMatchTextContent('No docs site of qits-ci-service in Guides.');
    await view.getByRole('link', { name: 'Clear the filter' }).click();
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/docs/repositories/qits-ci-service`,
    );
    expect(shown(opened)).toHaveLength(3);
  });

  it('says a repository that published no site has none yet', async () => {
    const opened = await render('qits-ci-frontend');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent(
        'qits-ci-frontend has published no docs site yet. A release declares { type: docs } to publish here.',
      );
    expect(shown(opened)).toEqual([]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says the project has no repository of an unknown name, and shows no site', async () => {
    const opened = await render('no-such-repository');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('This project has no repository no-such-repository.');
    await expect.element(view.getByRole('link', { name: 'Back to Docs' })).toBeVisible();
    expect(shown(opened)).toEqual([]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const reads = await open('qits-ci-service');
    const { opened } = reads;
    const view = page.elementLocator(opened.page);
    const catalog = reads.catalog();
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    catalog.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This repository’s docs could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.settled();
    reads.catalog().flush(await goldenMaster(EVERY_KIND, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    expect(shown(opened)).toHaveLength(3);
  });

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('open-docs-site open: a row opens the site’s reader in this app (qits-2337)', async () => {
    const opened = await render('qits-ci-service');
    await userEvent.click(
      page.elementLocator(opened.page).getByRole('list', { name: 'Contracts' }).getByRole('link'),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/docs/read/@contracts%2Fqits-ci`,
    );
    expect(reached()).toEqual(['open-docs-site:open']);
  });

  it('leave-repository-docs docs: “← Docs” opens the project’s Docs page', async () => {
    const opened = await render('qits-ci-service');
    await page.elementLocator(opened.page).getByRole('link', { name: '← Docs' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/docs`);
    expect(reached()).toEqual(['leave-repository-docs:docs']);
  });
});
