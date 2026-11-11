import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../../testing/browser/app-route';

/**
 * Screenshots of an entity's page inside the shell (`openRoute`), answered with qits-artifacts'
 * recording of "a published contracts bundle with an entity map" (see
 * `entities.page.browser.spec.ts`): the domain Project, the technical LegacyPlacement, and a class
 * the map does not list. The recorded map holds no projection, so that case is the plain spec's
 * (`entity.page.spec.ts`). No recording holds a `golden-masters/index.json`, so its read (which
 * states record each operation) is refused, which the page names. Nor does any hold a bundle's
 * `database/index.json` (qits-2014), so it is answered 404, as a bundle published before the ER
 * diagrams answers it, and the page says no diagram is published; a drawn diagram is the plain
 * spec's (`entity.page.spec.ts`) until qits-artifacts records a bundle with one.
 */
const CONTRACTS = 'a published contracts bundle with an entity map';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('EntityPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page of `entity` in qits-projects-service's bundle, every read answered. */
  async function open(entity: string) {
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/repositories/qits-projects-service/entities/${entity}`,
    );
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
    http
      .expectOne((req) => req.url.endsWith('/golden-masters/index.json'))
      .flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne((req) => req.url.endsWith('/database/index.json'))
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    return opened;
  }

  it('shows a domain entity’s DTOs and operations', async () => {
    const opened = await open('eu.wohlben.qits.entities.domain.Project');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: 'Project', exact: true })).toBeVisible();
    await expect.element(view).toMatchTextContent('eu.wohlben.qits.entities.dto.ProjectDto');
    await expect.element(view).toMatchTextContent('ProjectMapper.toDto(Project)');
    await expect.element(view).toMatchTextContent('No ER diagram published for this entity.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('domain', { kind: 'DATA' });
  });

  it('shows why a technical entity is one', async () => {
    const opened = await open('eu.wohlben.qits.entities.domain.LegacyPlacement');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('bookkeeping of a retired layout');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('technical', { kind: 'DATA' });
  });

  it('says so for a class the map does not list', async () => {
    const opened = await open('eu.wohlben.qits.entities.domain.Nothing');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No such entity in qits-projects 2100.1.0.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown', { kind: 'NO_DATA' });
  });
});
