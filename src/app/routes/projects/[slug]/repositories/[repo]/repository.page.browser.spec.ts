import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

const REPOSITORIES = 'a project with 3 repositories';
const RELEASED = 'released artifacts, some behind';
const NOTHING_RELEASED = 'no released artifacts';
const CATALOG = 'a docs catalog naming contract repositories';
/** A few days after the recorded releases, so "how long ago" is stable. */
const NOW = new Date('2026-01-20T00:00:00Z');

/**
 * Screenshots of a repository's page (qits-2478) inside the shell (`openRoute`), at the recorded
 * project's slug, its repositories answered with qits-projects' "a project with 3 repositories"
 * (`contract-service`, a SERVICE; `contract-frontend`, a FRONTEND; `contract-daemon`), the
 * artifacts with qits-maintenance's "released artifacts, some behind" (whose repositories are the
 * same `contract-*` names: `contract-service` publishes an image and a maven client) and the docs
 * catalog with qits-artifacts' "a docs catalog naming contract repositories"
 * (`@contracts/contract-service`, `@routes/contract-frontend`). Cases: a service (`service`), a
 * frontend (`frontend`), nothing released (`nothing`), the artifacts refused (`refused`), an
 * unknown name (`unknown`) and the reads open (`loading`). The providers' ids are unrelated: the
 * repositories are answered under the open project's id.
 */
describe('RepositoryPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  /** The page of `repo`, its reads still open. */
  async function open(repo: string) {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/repositories/${repo}`);
    return {
      opened,
      repositories: (): TestRequest =>
        http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`),
      artifacts: (): TestRequest => http.expectOne('/maintenance/api/artifacts'),
      catalog: (): TestRequest => http.expectOne('/artifacts/docs/docs'),
    };
  }

  /** `repo`'s page with every read answered; the artifacts from `released`. */
  async function render(repo: string, released = RELEASED): Promise<OpenedRoute> {
    const reads = await open(repo);
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    reads.artifacts().flush(await goldenMaster(released, 'listArtifacts', 'qits-maintenance'));
    reads.catalog().flush(await goldenMaster(CATALOG, 'listDocsSites', 'qits-artifacts'));
    await reads.opened.settled();
    return reads.opened;
  }

  /** Lets an exit's navigation finish, answering every read the next page makes with a 404. */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const pending = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of pending) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = pending.length ? 0 : quiet + 1;
    }
  }

  /** A list's rows' first link or name, in order. */
  const names = (opened: OpenedRoute, list: string) =>
    [...(opened.page.querySelector(`ul[aria-label="${list}"]`)?.querySelectorAll('li') ?? [])].map(
      (li) => li.querySelector('a, span')?.textContent?.trim(),
    );

  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('shows a service: its pages, its image and package, its docs site', async () => {
    const opened = await render('contract-service');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('contract-service');
    await expect.element(view).toMatchTextContent('Service');
    const pages = view.getByRole('navigation', { name: 'Repository pages' });
    await expect.element(pages.getByRole('link', { name: 'Contracts →' })).toBeVisible();
    await expect.element(pages.getByRole('link', { name: 'Entities →' })).toBeVisible();
    await expect.element(pages.getByRole('link', { name: 'Docs →' })).toBeVisible();
    expect(pages.getByRole('link', { name: 'UI builder →' }).query()).toBeNull();
    expect(names(opened, 'Published artifacts')).toEqual([
      'qits/contract-service',
      'eu.wohlben.qits:contract-service-client',
    ]);
    await expect
      .element(view.getByRole('link', { name: 'qits/contract-service' }))
      .toHaveAttribute('href', '/artifacts/repositories/qits/images/contract-service');
    await expect
      .element(view.getByRole('link', { name: 'eu.wohlben.qits:contract-service-client' }))
      .toHaveAttribute(
        'href',
        '/artifacts/repositories/maven/maven-packages/eu.wohlben.qits:contract-service-client',
      );
    expect(names(opened, 'Docs sites')).toEqual(['@contracts/contract-service']);
    // The repository sidebar is open, its Overview current (qits-2492), and the trail names it.
    await expect
      .element(
        page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Overview' }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent('contract-service');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('service', { kind: 'DATA' });
    await shootShellMenus(opened, 'service');
  });

  it('shows a frontend: its UI builder, its npm package', async () => {
    const opened = await render('contract-frontend');
    const view = page.elementLocator(opened.page);
    const pages = view.getByRole('navigation', { name: 'Repository pages' });
    await expect.element(pages.getByRole('link', { name: 'UI builder →' })).toBeVisible();
    expect(pages.getByRole('link', { name: 'Contracts →' }).query()).toBeNull();
    await expect
      .element(view.getByRole('link', { name: '@qits/contract-ui' }))
      .toHaveAttribute('href', '/artifacts/repositories/npm/packages/@qits%2Fcontract-ui');
    expect(names(opened, 'Docs sites')).toEqual(['@routes/contract-frontend']);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('frontend', { kind: 'DATA' });
  });

  it('says a repository that released nothing has no artifact yet', async () => {
    const opened = await render('contract-daemon', NOTHING_RELEASED);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('contract-daemon has published no image, package or daemon yet.');
    await expect
      .element(view)
      .toMatchTextContent('contract-daemon has published no docs site yet.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('nothing', { kind: 'NO_DATA' });
  });

  it('says reading artifacts needs a staff role, and keeps the rest', async () => {
    const reads = await open('contract-service');
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    reads.artifacts().flush(null, { status: 403, statusText: 'Forbidden' });
    reads.catalog().flush(await goldenMaster(CATALOG, 'listDocsSites', 'qits-artifacts'));
    await reads.opened.settled();
    const view = page.elementLocator(reads.opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading published artifacts needs a staff role');
    expect(names(reads.opened, 'Docs sites')).toEqual(['@contracts/contract-service']);
    await expect
      .element(page.elementLocator(reads.opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('says the project has no repository of an unknown name', async () => {
    const opened = await render('no-such-repository');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('This project has no repository no-such-repository.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown', { kind: 'NO_DATA' });
  });

  it('marks the page as loading', async () => {
    const reads = await open('contract-service');
    const view = page.elementLocator(reads.opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(reads.opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    reads.artifacts().flush(await goldenMaster(RELEASED, 'listArtifacts', 'qits-maintenance'));
    reads.catalog().flush(await goldenMaster(CATALOG, 'listDocsSites', 'qits-artifacts'));
    await reads.opened.settled();
  });

  it('open-repository-artifact image: an image opens its store page', async () => {
    const opened = await render('contract-service');
    await userEvent.click(
      page.elementLocator(opened.page).getByRole('link', { name: 'qits/contract-service' }),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/qits/images/contract-service');
    expect(reached()).toEqual(['open-repository-artifact:image']);
  });

  it('open-repository-artifact docsSite: a docs site opens its store page', async () => {
    const opened = await render('contract-service');
    await userEvent.click(
      page.elementLocator(opened.page).getByRole('link', { name: '@contracts/contract-service' }),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      '/artifacts/repositories/docs/docs/@contracts%2Fcontract-service',
    );
    expect(reached()).toEqual(['open-repository-artifact:docsSite']);
  });

  it('open-repository-pages contracts: Contracts opens the repository’s contracts', async () => {
    const opened = await render('contract-service');
    await userEvent.click(
      page.elementLocator(opened.page).getByRole('link', { name: 'Contracts →' }),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-service/contracts`,
    );
    expect(reached()).toEqual(['open-repository-pages:contracts']);
  });

  it.each([
    [
      'contract-service',
      'eu.wohlben.qits:contract-service-client',
      'maven',
      '/artifacts/repositories/maven/maven-packages/eu.wohlben.qits:contract-service-client',
    ],
    [
      'contract-frontend',
      '@qits/contract-ui',
      'npm',
      '/artifacts/repositories/npm/packages/@qits%2Fcontract-ui',
    ],
    [
      'contract-daemon',
      'contract-daemon',
      'daemon',
      '/artifacts/repositories/daemons/daemons/contract-daemon',
    ],
  ])('open-repository-artifact: %s’s %s opens its store page (%s)', async (repo, name, key, to) => {
    const opened = await render(repo);
    await userEvent.click(
      page.elementLocator(opened.page).getByRole('link', { name, exact: true }),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(to);
    expect(reached()).toEqual([`open-repository-artifact:${key}`]);
  });

  it.each([
    ['contract-service', 'Entities →', 'open-repository-pages:entities', '/entities'],
    ['contract-frontend', 'UI builder →', 'open-repository-pages:uiBuilder', '/ui-builder'],
  ])('%s: “%s” opens the repository’s page (%s)', async (repo, label, outcome, rest) => {
    const opened = await render(repo);
    await userEvent.click(page.elementLocator(opened.page).getByRole('link', { name: label }));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/${repo}${rest}`,
    );
    expect(reached()).toEqual([outcome]);
  });

  it('open-repository-docs repository: “Docs →” opens the repository’s Docs page', async () => {
    const opened = await render('contract-service');
    await userEvent.click(page.elementLocator(opened.page).getByRole('link', { name: 'Docs →' }));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-service/docs`,
    );
    expect(reached()).toEqual(['open-repository-docs:repository']);
  });

  it('open-repository-docs-category section: a docs category opens the Docs page at that section', async () => {
    const opened = await render('contract-service');
    await userEvent.click(
      page
        .elementLocator(opened.page)
        .getByRole('navigation', { name: 'Docs by category' })
        .getByRole('link', { name: /^Contracts/ }),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-service/docs?section=contracts`,
    );
    expect(reached()).toEqual(['open-repository-docs-category:section']);
  });

  it('leave-repository repositories: “← Repositories” goes back to the list', async () => {
    const opened = await render('contract-service');
    await page.elementLocator(opened.page).getByRole('link', { name: '← Repositories' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/repositories`);
    expect(reached()).toEqual(['leave-repository:repositories']);
  });
});
