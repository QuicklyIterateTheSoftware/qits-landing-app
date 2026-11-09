import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { provideHeyApiClient as provideArtifactsClient } from '../../../../../../api/artifacts/client/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { UiBuilderPage } from './ui-builder.page';

/**
 * Screenshots of the UI builder, answered with qits-artifacts' recording of "a published routes
 * bundle" (`@routes/qits-landing`, whose newest version names `qits-landing-app`: a root redirect,
 * `projects`, `projects/:slug/repositories` with two states, a redirect and `**`) and qits-projects'
 * recorded project and repositories. The project's repositories do not list `qits-landing-app`, so
 * its scope is not known and no chip shows; the case without a site is `contract-frontend`, whose
 * component is `contract`.
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

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('UiBuilderPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/repositories/:repo/ui-builder', component: UiBuilderPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideArtifactsClient(artifactsClient),
      ],
    });
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
    await page.viewport(1280, 800);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/repositories/${repo}/ui-builder`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(
        await goldenMaster('a project with repositories in components', 'listProjectRepositories'),
      );
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '1280px';
    return { fixture: harness.fixture, element, sites: http.expectOne('/artifacts/docs/docs') };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 3; i++) await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Answers the catalog, the site's versions and its manifest from the recorded bundle, then the
   * entity maps' catalog: with the bundle's (no contracts site), or with `entities`.
   */
  async function answerBundle(
    fixture: { whenStable(): Promise<unknown>; detectChanges(): void },
    sites: { flush(body: unknown): void },
    entities: () => Promise<void> = async () =>
      http
        .expectOne('/artifacts/docs/docs')
        .flush(await goldenMaster(BUNDLE, 'listDocsSites', 'qits-artifacts')),
  ) {
    sites.flush(await goldenMaster(BUNDLE, 'listDocsSites', 'qits-artifacts'));
    await settle();
    http
      .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@routes/qits-landing'))
      .flush(await goldenMaster(BUNDLE, 'listDocsVersions', 'qits-artifacts'));
    await settle();
    http
      .expectOne((req) => req.url.endsWith('/manifest.json'))
      .flush(await goldenMaster(BUNDLE, 'getDocsFile', 'qits-artifacts'));
    await answered(fixture);
    await entities();
    await answered(fixture);
  }

  /** Answers the entity maps' catalog, the contracts site's versions and its `entities.json`. */
  async function answerEntityMap() {
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster(CONTRACTS, 'listDocsSites', 'qits-artifacts'));
    await settle();
    http
      .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@contracts/qits-projects'))
      .flush(await goldenMaster(CONTRACTS, 'listDocsVersions', 'qits-artifacts'));
    for (let i = 0; i < 3; i++) await settle();
    http
      .expectOne((req) => req.url.endsWith('/entities.json'))
      .flush(await goldenMaster(CONTRACTS, 'getDocsFile', 'qits-artifacts'));
  }

  it('shows the route tree with the first route with states selected', async () => {
    const { fixture, element, sites } = await render('qits-landing-app');
    await answerBundle(fixture, sites);
    const view = page.elementLocator(element);
    await expect
      .element(view.getByRole('heading', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    await expect.element(view.getByRole('tab', { name: 'error' })).toBeVisible();
    await expect.element(view).toMatchTextContent('listProjectRepositories');
    await expect.element(view).toMatchScreenshot('loaded');
  });

  it('lists the domain entities the route touches, with their verbs', async () => {
    const { fixture, element, sites } = await render('qits-landing-app');
    await answerBundle(fixture, sites, answerEntityMap);
    const view = page.elementLocator(element);
    await expect
      .element(view.getByRole('heading', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    await expect.element(view.getByText('Repository', { exact: true })).toBeVisible();
    await expect.element(view).toMatchScreenshot('entities');
  });

  it('marks the entities no route shows, and lists a picked entity’s routes', async () => {
    const { fixture, element, sites } = await render('qits-landing-app');
    await answerBundle(fixture, sites, answerEntityMap);
    const view = page.elementLocator(element);
    await view.getByRole('tab', { name: 'Entities' }).click();
    await answered(fixture);
    await expect.element(view).toMatchTextContent('1 of 3 domain entities have no route');
    await expect.element(view).toMatchTextContent('No route shows this');
    await view.getByRole('button', { name: 'Project 1' }).click();
    await commands.parkPointer();
    await answered(fixture);
    await expect
      .element(view.getByRole('button', { name: '/projects/:slug/repositories' }))
      .toBeVisible();
    await expect.element(view).toMatchScreenshot('entity-view');
  });

  it('says a route without states has nothing frozen', async () => {
    const { fixture, element, sites } = await render('qits-landing-app');
    await answerBundle(fixture, sites);
    const view = page.elementLocator(element);
    await view.getByRole('button', { name: 'projects 0' }).click();
    // The pointer stays on the button after the click; its hover colour would vary the screenshot.
    await commands.parkPointer();
    await answered(fixture);
    await expect.element(view).toMatchTextContent('No screenshot test for this route');
    await expect.element(view).toMatchScreenshot('no-states');
  });

  it('says so when no frozen routes are published for the repository', async () => {
    const { fixture, element, sites } = await render('contract-frontend');
    sites.flush(await goldenMaster('a published docs site', 'listDocsSites', 'qits-artifacts'));
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect
      .element(view)
      .toMatchTextContent('No frozen routes published for contract-frontend.');
    await expect.element(view).toMatchTextContent('Scope: contract');
    await expect.element(view).toMatchScreenshot('none');
  });

  it('marks the page as failed when the docs store cannot be read', async () => {
    const { fixture, element, sites } = await render('qits-landing-app');
    sites.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
