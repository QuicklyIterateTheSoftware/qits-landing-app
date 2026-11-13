import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';
import {
  answerFile,
  answerTwoSiteCatalog,
  GITHOST,
  INDEX,
  leftFor,
} from '../../../../../../../testing/browser/contracts-bundles';

/**
 * Screenshots of a repository's contracts list inside the shell (`openRoute`), answered with
 * qits-artifacts' recordings: "a published docs site" (a catalog with no `@contracts/` site) and
 * "a published contracts bundle with an entity map" (`@contracts/qits-projects` at 2100.1.0,
 * naming qits-projects-service), whose index read is refused, which the page names.
 *
 * The loaded list is qits-githost-service's, from qits-2041's `a published contracts bundle with a
 * golden-master index` (`contracts-bundles.ts`). Its links are declared exits (epic qits-2000),
 * each followed once: a state's name (`open-listed-contract-state` `state`) and the frame's
 * Entities tab (`switch-contracts-section` `entities`). The page each leaves for is its own
 * spec's: its reads are answered with an error (`leftFor`).
 */
const CONTRACTS = 'a published contracts bundle with an entity map';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('ContractsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (repo: string) =>
    openRoute((project) => `/projects/${project.slug}/repositories/${repo}/contracts`);

  /** githost's list of states, its index answered. */
  async function loaded() {
    const opened = await open(GITHOST);
    await answerTwoSiteCatalog(opened);
    await answerFile(opened, 'qits-githost', 'golden-masters/index.json', INDEX);
    return opened;
  }

  /** The outcomes recorded so far, as `interaction:outcome`. */
  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('lists the states the bundle records, each linking its page', async () => {
    const opened = await loaded();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('link', { name: 'a git project exists' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'a git project with a repository' }))
      .toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'Contracts' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('states', { kind: 'DATA' });
  });

  it('open-listed-contract-state state: a state’s name opens its page', async () => {
    const opened = await loaded();
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'a git project with a repository' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['open-listed-contract-state:state']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/${GITHOST}/contracts/a-git-project-with-a-repository`,
    );
  });

  it('switch-contracts-section entities: the Entities tab opens the entity map', async () => {
    const opened = await loaded();
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'Entities', exact: true }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['switch-contracts-section:entities']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/${GITHOST}/entities`,
    );
  });

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
    await expect.element(view).toMatchTextContent('@contracts/qits-projects 2100.1.0');
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
    const opened = await open('qits-projects-service');
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster('a published docs site', 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('No contracts bundle is published for qits-projects-service.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('none', { kind: 'NO_DATA' });
  });

  it('marks the page as failed when the docs store cannot be read', async () => {
    const opened = await open('qits-projects-service');
    http.expectOne('/artifacts/docs/docs').flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
