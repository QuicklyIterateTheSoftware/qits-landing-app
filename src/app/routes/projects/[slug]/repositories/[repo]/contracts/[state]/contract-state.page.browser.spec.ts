import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../../testing/browser/app-route';

/**
 * Screenshots of a provider state's page inside the shell (`openRoute`), answered with
 * qits-artifacts' recordings as `contracts.page.browser.spec.ts` explains. No recording holds a
 * `golden-masters/index.json` or a recorded response of it, so a state with its JSON, a byte
 * answer and an unknown slug are the plain spec's (`contract-state.page.spec.ts`, against
 * qits-projects' own published index); here the index read is refused.
 */
const CONTRACTS = 'a published contracts bundle with an entity map';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('ContractStatePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
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
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('unreadable-index');
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
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('none');
  });
});
