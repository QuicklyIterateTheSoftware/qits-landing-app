import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../../testing/browser/contracts-bundles';

/**
 * Screenshots of a repository's entity map inside the shell (`openRoute`), answered with
 * qits-artifacts' recording of "a published contracts bundle with an entity map":
 * `@contracts/qits-projects` at 2100.1.0, naming qits-projects-service, whose `entities.json`
 * holds Project, Repository and WorkEntity (domain) and LegacyPlacement (technical). The case
 * without a bundle is "a published docs site", whose catalog has no `@contracts/` site.
 *
 * An entity's name is a declared exit (`open-listed-entity` `entity`, epic qits-2000), shown by
 * `loaded` and followed once; the page it leaves for is its own spec's (`leftFor`).
 */
const CONTRACTS = 'a published contracts bundle with an entity map';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('EntitiesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (repo: string) =>
    openRoute((project) => `/projects/${project.slug}/repositories/${repo}/entities`);

  /** Answers the catalog, the contracts site's versions and its `entities.json`. */
  async function answerBundle(opened: OpenedRoute) {
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
    await opened.settled();
  }

  it('lists the entities grouped by marking', async () => {
    const opened = await open('qits-projects-service');
    await answerBundle(opened);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: 'domain 3' })).toBeVisible();
    await expect.element(view.getByRole('heading', { name: 'technical 1' })).toBeVisible();
    await expect.element(view.getByRole('link', { name: 'LegacyPlacement' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
  });

  it('open-listed-entity entity: an entity’s name opens its page', async () => {
    const opened = await open('qits-projects-service');
    await answerBundle(opened);
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'LegacyPlacement' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-listed-entity:entity',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/qits-projects-service/entities/eu.wohlben.qits.entities.domain.LegacyPlacement`,
    );
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
});
