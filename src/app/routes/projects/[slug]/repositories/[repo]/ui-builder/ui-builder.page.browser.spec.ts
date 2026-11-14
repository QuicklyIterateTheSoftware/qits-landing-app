import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster, goldenMasterText } from '../../../../../../../testing/browser/golden-master';
import { leftFor } from '../../../../../../../testing/browser/contracts-bundles';
import { expectUnclipped } from '../../../../../../../testing/browser/unclipped';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the UI builder inside the shell (`openRoute`), answered with qits-artifacts'
 * recording of "a published routes bundle" (`@routes/qits-landing`, whose newest version names
 * `qits-landing-app`: a root redirect, `projects`, `projects/:slug/repositories` with two states, a
 * redirect and `**`) and qits-projects' recorded project and repositories. The project's
 * repositories do not list `qits-landing-app`, so its scope is not known and no chip shows; the
 * case without a site is `contract-frontend`, whose component is `contract`.
 *
 * The `kinds-viewports` cases answer the bundle with "a published routes bundle with kinds and
 * viewports" (qits-2059: the same site at a newer version, whose `projects/:slug/repositories` has
 * the states `loaded`, DATA at PHONE, TABLET and DESKTOP, `empty`, NO_DATA at DESKTOP, and `error`,
 * ERROR at the test's own width): each tab carries its kind's chip, data first, and the Viewport
 * switch shows, DESKTOP pressed until another width is picked.
 *
 * A freeze's HTML is left unanswered in most cases, so the frame's place shows the state being
 * read. The frame link case answers it with qits-2041's "a published routes bundle freeze", whose
 * recorded body (read as text, `goldenMasterText`, qits-2058) links `/projects/qits/repositories`:
 * clicked in the frame, it selects that route (`?route=`), a same-route navigation that declares no
 * outcome.
 *
 * The entity maps (qits-1950) are read once the bundle is in. Answered with the bundle's own
 * catalog they find no `@contracts/` site, so the route's calls touch no mapped entity and
 * qits-projects-service is named without a map. The `entities` and `entity-view` cases answer them
 * with "a published contracts bundle with an entity map" (`@contracts/qits-projects`, naming
 * qits-projects-service: Project and Repository, which the bundle's calls reach, WorkEntity, which
 * none does, and one technical entity), recorded by qits-artifacts from qits-1950's release on.
 *
 * An entity's page is a declared exit (`open-builder-entity`, epic qits-2000), each followed once:
 * the ↗ of an entity the route touches (`routeEntity`, shown by `entities`), the ↗ of an entity in
 * the Entities tab (`listedEntity`) and the picked entity's name (`pickedEntity`), both shown by
 * `entity-view`. The page each leaves for is its own spec's (`leftFor`).
 */

const BUNDLE = 'a published routes bundle';
const CONTRACTS = 'a published contracts bundle with an entity map';
const KINDS = 'a published routes bundle with kinds and viewports';

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
   * Answers the catalog, the site's versions and its manifest from the recorded bundle `state`
   * (`a published routes bundle` unless named), then the entity maps' catalog: with the state's
   * (no contracts site), or with `entities`.
   */
  async function answerBundle(
    opened: OpenedRoute,
    sites: { flush(body: unknown): void },
    entities?: () => Promise<void>,
    state = BUNDLE,
  ) {
    sites.flush(await goldenMaster(state, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@routes/qits-landing'))
      .flush(await goldenMaster(state, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/manifest.json'))
      .flush(await goldenMaster(state, 'getDocsFile', 'qits-artifacts'));
    await opened.settled();
    await (entities ?? (() => answerNoEntityMap(state)))();
    await opened.settled();
  }

  /** Answers the entity maps' catalog with `state`'s, which holds no `@contracts/` site. */
  async function answerNoEntityMap(state: string) {
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster(state, 'listDocsSites', 'qits-artifacts'));
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
    // `error` answers listProjects alone, shown as the route's own call: the bundle has only one
    // route with freezes, below APP_WIDE_MIN_ROUTES (qits-2080).
    await expect.element(view).toMatchTextContent('listProjects');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('lists the domain entities the route touches, with their verbs', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, () => answerEntityMap(opened));
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    await expect.element(view.getByText('Repository', { exact: true })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('entities', { kind: 'DATA' });
  });

  it('opens a call’s popover whole, out of the Calls panel that scrolls (qits-2081)', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites);
    const view = page.elementLocator(opened.page);
    // The shown state's one call is its own (qits-2080): below APP_WIDE_MIN_ROUTES, so visible
    // without opening any group.
    const call = view.getByRole('button', { name: /listProjects/ }).first();
    await call.click();
    await commands.parkPointer();
    await opened.settled();
    const dialog = view.getByRole('dialog');
    await expect.element(dialog).toMatchTextContent('No contracts published for');
    await expect.poll(() => dialog.element().getAttribute('data-floating-side')).toBe('below');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expectUnclipped(dialog.element());
    // Wider than the Calls panel: it reaches out of it, to the left.
    const calls = opened.page.querySelector('[aria-label="Calls"]')!.getBoundingClientRect();
    expect(dialog.element().getBoundingClientRect().left).toBeLessThan(calls.left);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('call-open', { kind: 'DATA' });
  });

  it('marks each state with its kind, data first, and shows the viewport switch', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, undefined, KINDS);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    const tabs = view.getByRole('tablist', { name: 'States' });
    // Data first: `loaded` is selected, though `empty` and `error` sort before it by name.
    await expect
      .element(tabs.getByRole('tab', { name: 'loaded' }))
      .toHaveAttribute('aria-selected', 'true');
    // Each tab's chip says its kind.
    const chip = (name: string) =>
      tabs.getByRole('tab', { name }).element().querySelector('ui-chip')?.textContent?.trim();
    expect(chip('loaded')).toBe('data');
    expect(chip('error')).toBe('error');
    expect(chip('empty')).toBe('no data');
    const viewports = view.getByRole('group', { name: 'Viewport' });
    for (const width of ['Phone', 'Tablet']) {
      await expect
        .element(viewports.getByRole('button', { name: width }))
        .toHaveAttribute('aria-pressed', 'false');
    }
    await expect
      .element(viewports.getByRole('button', { name: 'Desktop' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('kinds-viewports', { kind: 'DATA' });
  });

  it('lists the calls of the state picked, not the route’s (qits-2080)', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, undefined, KINDS);
    const view = page.elementLocator(opened.page);
    const calls = page.elementLocator(opened.page.querySelector('[aria-label="Calls"]')!);
    const tabs = view.getByRole('tablist', { name: 'States' });
    // `loaded` (DATA) answers both calls, shown as its own: below APP_WIDE_MIN_ROUTES, the one
    // route with freezes cannot make a call app-wide (qits-2080).
    await expect
      .element(tabs.getByRole('tab', { name: 'loaded' }))
      .toHaveAttribute('aria-selected', 'true');
    await expect.element(calls).toMatchTextContent('listProjectRepositories');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('state-data', { kind: 'DATA' });

    // `error` answers listProjects alone, also its own.
    await tabs.getByRole('tab', { name: 'error' }).click();
    await commands.parkPointer();
    await opened.settled();
    await expect
      .element(tabs.getByRole('tab', { name: 'error' }))
      .toHaveAttribute('aria-selected', 'true');
    await expect.element(calls).toMatchTextContent('listProjects');
    await expect.element(calls).not.toMatchTextContent('listProjectRepositories');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('state-error', { kind: 'ERROR' });
  });

  it('draws the state at the viewport picked', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, undefined, KINDS);
    const view = page.elementLocator(opened.page);
    const viewports = view.getByRole('group', { name: 'Viewport' });
    await viewports.getByRole('button', { name: 'Phone' }).click();
    // The pointer stays on the button after the click; its hover colour would vary the screenshot.
    await commands.parkPointer();
    await opened.settled();
    await expect
      .element(viewports.getByRole('button', { name: 'Phone' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(viewports.getByRole('button', { name: 'Desktop' }))
      .toHaveAttribute('aria-pressed', 'false');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('viewport-picked', { kind: 'DATA' });
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
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('entity-view', { kind: 'DATA' });
  });

  /** The outcomes recorded so far, as `interaction:outcome`. */
  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /** The entity page of qits-projects-service's `entity` (its class name). */
  const entityPage = (opened: OpenedRoute, entity: string) =>
    `/projects/${opened.project.slug}/repositories/qits-projects-service/entities/eu.wohlben.qits.entities.${entity}`;

  it('open-builder-entity routeEntity: an entity the route touches opens its page', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, () => answerEntityMap(opened));
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'Open Repository entity page' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['open-builder-entity:routeEntity']);
    expect(TestBed.inject(Router).url).toBe(entityPage(opened, 'domain.Repository'));
  });

  it('open-builder-entity listedEntity: an entity’s ↗ in the Entities tab opens its page', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, () => answerEntityMap(opened));
    const view = page.elementLocator(opened.page);
    await view.getByRole('tab', { name: 'Entities' }).click();
    await opened.settled();
    // WorkEntity: no route shows it, so its ↗ is the Entities tab's alone.
    await view.getByRole('link', { name: 'Open WorkEntity entity page' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['open-builder-entity:listedEntity']);
    expect(TestBed.inject(Router).url).toBe(entityPage(opened, 'entity.WorkEntity'));
  });

  it('open-builder-entity pickedEntity: the picked entity’s name opens its page', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites, () => answerEntityMap(opened));
    const view = page.elementLocator(opened.page);
    await view.getByRole('tab', { name: 'Entities' }).click();
    await opened.settled();
    await view.getByRole('button', { name: 'Project 1' }).click();
    await opened.settled();
    await view.getByRole('link', { name: 'Project', exact: true }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['open-builder-entity:pickedEntity']);
    expect(TestBed.inject(Router).url).toBe(entityPage(opened, 'domain.Project'));
  });

  it('selects the route a link in the frozen page leads to', async () => {
    const { opened, sites } = await render('qits-landing-app');
    await answerBundle(opened, sites);
    // The bundle's assets: no recording lists them here, so the frame draws without its font.
    for (const request of http.match((req) => /\/-\/[^/]+$/.test(req.url))) {
      request.flush(null, { status: 404, statusText: 'Not Found' });
    }
    http
      .expectOne((req) => req.url.endsWith('.html'))
      .flush(
        await goldenMasterText('a published routes bundle freeze', 'getDocsFile', 'qits-artifacts'),
      );
    await opened.settled();
    const frame = opened.page.querySelector<HTMLIFrameElement>('iframe');
    // The frame's links are held once its document has loaded (`holdLinks`).
    await expect
      .poll(
        () =>
          frame?.contentDocument?.readyState === 'complete' &&
          frame.contentDocument.querySelector('a'),
      )
      .toBeTruthy();
    await opened.settled();
    const router = TestBed.inject(Router);
    expect(router.parseUrl(router.url).queryParams['route']).toBeUndefined();
    frame!
      .contentDocument!.querySelector<HTMLAnchorElement>('a[href="/projects/qits/repositories"]')!
      .click();
    await opened.settled();
    await expect
      .poll(() => router.parseUrl(router.url).queryParams['route'])
      .toBe('projects/:slug/repositories');
    // A same-route query change: no outcome.
    expect(fired()).toEqual([]);
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
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-states', { kind: 'NO_DATA' });
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
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('none', { kind: 'NO_DATA' });
  });

  it('marks the page as failed when the docs store cannot be read', async () => {
    const { opened, sites } = await render('qits-landing-app');
    sites.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
