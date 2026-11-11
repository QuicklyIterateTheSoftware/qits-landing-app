import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { commands, page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';

/**
 * Screenshots of the UI builder inside the shell (`openRoute`), answered with qits-artifacts'
 * recording of "a published routes bundle" (`@routes/qits-landing`, whose newest version names
 * `qits-landing-app`: a root redirect, `projects`, `projects/:slug/repositories` with two states, a
 * redirect and `**`) and qits-projects' recorded project and repositories. The project's
 * repositories do not list `qits-landing-app`, so its scope is not known and no chip shows; the
 * case without a site is `contract-frontend`, whose component is `contract`.
 *
 * A freeze's HTML is recorded without a body, so no recording can answer it: the frame's place
 * shows the state being read, and its request is left unanswered.
 *
 * The entity maps (qits-1950) are read once the bundle is in. Answered with the bundle's own
 * catalog they find no `@contracts/` site, so the route's calls touch no mapped entity and
 * qits-projects-service is named without a map. The `entities` and `entity-view` cases answer them
 * with "a published contracts bundle with an entity map" (`@contracts/qits-projects`, naming
 * qits-projects-service: Project and Repository, which the bundle's calls reach, WorkEntity, which
 * none does, and one technical entity), recorded by qits-artifacts from qits-1950's release on.
 */

const BUNDLE = 'a published routes bundle';
const CONTRACTS = 'a published contracts bundle with an entity map';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('UiBuilderPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    // A freeze and the bundle's assets: no recording holds their bytes (see above).
    http.match((req) => req.url.includes('/-/'));
    http.verify();
    await page.viewport(800, 600);
  });

  /** The page for `repo`, with the project, its repositories and the docs catalog requested. */
  async function render(repo: string) {
    // Wide enough for the three columns.
    await page.viewport(1520, 800);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/repositories/${repo}/ui-builder`,
    );
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
      .flush(
        await goldenMaster('a project with repositories in components', 'listProjectRepositories'),
      );
    return { opened, sites: http.expectOne('/artifacts/docs/docs') };
  }

  /**
   * Answers the catalog, the site's versions and its manifest from the recorded bundle, then the
   * entity maps' catalog: with the bundle's (no contracts site), or with `entities`.
   */
  async function answerBundle(
    opened: OpenedRoute,
    sites: { flush(body: unknown): void },
    entities: () => Promise<void> = async () =>
      http
        .expectOne('/artifacts/docs/docs')
        .flush(await goldenMaster(BUNDLE, 'listDocsSites', 'qits-artifacts')),
  ) {
    sites.flush(await goldenMaster(BUNDLE, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@routes/qits-landing'))
      .flush(await goldenMaster(BUNDLE, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/manifest.json'))
      .flush(await goldenMaster(BUNDLE, 'getDocsFile', 'qits-artifacts'));
    await opened.settled();
    await entities();
    await opened.settled();
  }

  /** Answers the entity maps' catalog, the contracts site's versions and its `entities.json`. */
  async function answerEntityMap(opened: OpenedRoute) {
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster(CONTRACTS, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@contracts/qits-projects'))
      .flush(await goldenMaster(CONTRACTS, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/entities.json'))
      .flush(await goldenMaster(CONTRACTS, 'getDocsFile', 'qits-artifacts'));
  }

  it('shows the route tree with the first route with states selected', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    await expect.element(view.getByRole('tab', { name: 'error' })).toBeVisible();
    await expect.element(view).toMatchTextContent('listProjectRepositories');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loaded');
  });

  it('lists the domain entities the route touches, with their verbs', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, () => answerEntityMap(opened));
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    await expect.element(view.getByText('Repository', { exact: true })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('entities');
  });

  it('marks the entities no route shows, and lists a picked entity’s routes', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, () => answerEntityMap(opened));
    const view = page.elementLocator(opened.page);
    await view.getByRole('tab', { name: 'Entities' }).click();
    await opened.settled();
    await expect.element(view).toMatchTextContent('1 of 3 domain entities have no route');
    await expect.element(view).toMatchTextContent('No route shows this');
    await view.getByRole('button', { name: 'Project 1' }).click();
    await commands.parkPointer();
    await opened.settled();
    await expect
      .element(view.getByRole('button', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('entity-view');
  });

  it('scrolls each of the three panels on its own, and never the window', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites);
    // 1280px is the narrowest the panels sit side by side; 400px is short enough that the frozen
    // page overflows its panel.
    await page.viewport(1280, 400);
    await opened.settled();
    const main = opened.frame.querySelector('main')!;
    const grid = opened.page.querySelector<HTMLElement>('[data-columns]')!;
    const columns = [...grid.children] as HTMLElement[];
    expect(columns.map((column) => column.getAttribute('aria-label'))).toEqual([
      null,
      'Preview',
      'Calls',
    ]);
    // The recording's tree and calls are short; a spacer makes every panel taller than its box,
    // so each has room to scroll (the layout is under test, not the recording).
    for (const column of columns) {
      if (column.scrollHeight > column.clientHeight) continue;
      const spacer = document.createElement('div');
      spacer.style.height = '1200px';
      column.append(spacer);
    }
    for (const column of columns) {
      expect(column.scrollHeight).toBeGreaterThan(column.clientHeight);
    }
    // Scrolled to its end, <main> shows the panels filling it exactly, the title row gone.
    main.scrollTop = main.scrollHeight;
    const box = main.getBoundingClientRect();
    expect(Math.round(grid.getBoundingClientRect().top)).toBe(Math.round(box.top));
    expect(Math.round(grid.getBoundingClientRect().bottom)).toBe(Math.round(box.bottom));
    const mainTop = main.scrollTop;
    for (const [i, column] of columns.entries()) {
      column.scrollTop = 150;
      expect(column.scrollTop).toBe(150);
      for (const [j, other] of columns.entries()) {
        if (j !== i) expect(other.scrollTop).toBe(j < i ? 150 : 0);
      }
      expect(main.scrollTop).toBe(mainTop);
      expect(document.scrollingElement!.scrollTop).toBe(0);
    }
  });

  it('says a route without states has nothing frozen', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites);
    const view = page.elementLocator(opened.page);
    // The row's count is its fold button's; the route button is named by its segment alone.
    await view.getByRole('button', { name: 'projects', exact: true }).click();
    // The pointer stays on the button after the click; its hover colour would vary the screenshot.
    await commands.parkPointer();
    await opened.settled();
    await expect.element(view).toMatchTextContent('No screenshot test for this route');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('no-states');
  });

  it('says so when no frozen routes are published for the repository', async () => {
    const { opened, sites } = await render('contract-frontend');
    sites.flush(await goldenMaster('a published docs site', 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('No frozen routes published for contract-frontend.');
    await expect.element(view).toMatchTextContent('Scope: contract');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('none');
  });

  it('marks the page as failed when the docs store cannot be read', async () => {
    const { opened, sites } = await render('qits-landing-app');
    sites.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('error');
  });
});
