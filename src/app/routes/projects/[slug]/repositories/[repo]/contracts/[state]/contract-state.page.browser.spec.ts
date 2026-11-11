import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../../testing/browser/app-route';
import {
  answerFile,
  answerTwoSiteCatalog,
  DEPENDENCY,
  GITHOST,
  INDEX,
  leftFor,
  forgetBundleReads,
} from '../../../../../../../../testing/browser/contracts-bundles';

/**
 * Screenshots of a provider state's page inside the shell (`openRoute`), answered with
 * qits-artifacts' recordings as `contracts.page.browser.spec.ts` explains. No recording holds a
 * recorded response of an index, so a state with its JSON, a byte answer and an unknown slug are
 * the plain spec's (`contract-state.page.spec.ts`, against qits-projects' own published index).
 *
 * qits-githost-service's `a git project with a repository` is qits-2041's (`contracts-bundles.ts`):
 * its index from `a published contracts bundle with a golden-master index`, and the index its
 * qits-projects dependency points into from `a published contracts bundle a dependency points
 * into`; its recorded response is read from no recording, so that read is refused and the
 * operation says so. Its links are declared exits (epic qits-2000), each followed once: a
 * dependency in another repository (`open-state-dependency` `dependency`), "← All states"
 * (`leave-contract-state` `allStates`) and the frame's Contracts tab (`switch-contracts-section`
 * `contracts`). The page each leaves for is its own spec's (`leftFor`).
 */
const CONTRACTS = 'a published contracts bundle with an entity map';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('ContractStatePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    forgetBundleReads();
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (repo: string) =>
    openRoute(
      (project) => `/projects/${project.slug}/repositories/${repo}/contracts/a-project-exists`,
    );

  it('names the bundle and says so when its golden masters cannot be read', async () => {
    const opened = await open('qits-projects-service');
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster(CONTRACTS, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@contracts/qits-projects'))
      .flush(await goldenMaster(CONTRACTS, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/golden-masters/index.json'))
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: 'Provider state' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent(
        'Could not read the golden masters of @contracts/qits-projects 2100.1.0.',
      );
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unreadable-index', { kind: 'ERROR' });
  });

  it('says so when no contracts bundle is published for the repository', async () => {
    const opened = await open('contract-frontend');
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster(CONTRACTS, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@contracts/qits-projects'))
      .flush(await goldenMaster(CONTRACTS, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('No contracts bundle is published for contract-frontend.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('none', { kind: 'NO_DATA' });
  });

  /** githost's `a git project with a repository`, both indexes answered, its recording refused. */
  async function withDependencies(): Promise<OpenedRoute> {
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/repositories/${GITHOST}/contracts/a-git-project-with-a-repository`,
    );
    await answerTwoSiteCatalog(opened);
    await answerFile(opened, 'qits-githost', 'golden-masters/index.json', INDEX);
    await answerFile(opened, 'qits-projects', 'golden-masters/index.json', DEPENDENCY);
    // The recorded response: no recording holds it.
    for (const request of http.match((req) => req.url.endsWith('/getGitRepository.json'))) {
      request.flush(null, { status: 404, statusText: 'Not Found' });
    }
    await opened.settled();
    return opened;
  }

  /** The outcomes recorded so far, as `interaction:outcome`. */
  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('links each dependency to its state, in its own repository', async () => {
    const opened = await withDependencies();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: 'a git project with a repository' }))
      .toBeVisible();
    await expect.element(view.getByRole('link', { name: 'a git project exists' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'qits-projects: a project exists' }))
      .toBeVisible();
    await expect.element(view.getByRole('link', { name: '← All states' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('dependencies', { kind: 'DATA' });
  });

  it('open-state-dependency dependency: a dependency opens the state in its repository', async () => {
    const opened = await withDependencies();
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'qits-projects: a project exists' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['open-state-dependency:dependency']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/qits-projects-service/contracts/a-project-exists`,
    );
  });

  it('leave-contract-state allStates: “← All states” goes back to the list', async () => {
    const opened = await withDependencies();
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: '← All states' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['leave-contract-state:allStates']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/${GITHOST}/contracts`,
    );
  });

  it('switch-contracts-section contracts: the Contracts tab opens the list', async () => {
    const opened = await withDependencies();
    const view = page.elementLocator(opened.page);
    const tab = view.getByRole('link', { name: 'Contracts', exact: true });
    await expect.element(tab).toHaveAttribute('aria-current', 'page');
    await tab.click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['switch-contracts-section:contracts']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/${GITHOST}/contracts`,
    );
  });
});
