import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';

/**
 * Screenshots of a repository's contracts list inside the shell (`openRoute`), answered with
 * qits-artifacts' recordings: "a published docs site" (a catalog with no `@contracts/` site) and
 * "a published contracts bundle with an entity map" (`@contracts/qits-projects` at 2100.1.0,
 * naming qits-projects-service). No recording holds a `golden-masters/index.json`, so the loaded
 * list is the plain spec's (`contracts.page.spec.ts`, against qits-projects' own published
 * index); here the index read is refused, which the page names.
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
