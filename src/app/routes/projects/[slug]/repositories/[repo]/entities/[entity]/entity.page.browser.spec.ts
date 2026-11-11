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
  ENTITY_MAP,
  GITHOST,
  INDEX,
  leftFor,
  PROJECTION,
  forgetBundleReads,
} from '../../../../../../../../testing/browser/contracts-bundles';

/**
 * Screenshots of an entity's page inside the shell (`openRoute`), answered with qits-artifacts'
 * recording of "a published contracts bundle with an entity map" (see
 * `entities.page.browser.spec.ts`): the domain Project, the technical LegacyPlacement, and a class
 * the map does not list; its `golden-masters/index.json` read (which states record each operation)
 * is refused, which the page names. No recording holds a bundle's
 * `database/index.json` (qits-2014), so it is answered 404, as a bundle published before the ER
 * diagrams answers it, and the page says no diagram is published; a drawn diagram is the plain
 * spec's (`entity.page.spec.ts`) until qits-artifacts records a bundle with one.
 *
 * qits-githost-service's entities are qits-2041's (`contracts-bundles.ts`): its map from `a
 * published contracts bundle with a projection entity` (GitProject, a projection of
 * `qits-projects:Project`, and GitRepository, handed out by `getGitRepository`), its index from `a
 * published contracts bundle with a golden-master index`, and the projected application's map
 * from qits-projects' entity map. The page's links are declared exits (epic qits-2000), each
 * followed once: the projected entity (`open-entity-relation` `projectionOf`), a state recording
 * an operation (`open-entity-relation` `recordedIn`) and "← All entities" (`leave-entity`
 * `allEntities`). The page each leaves for is its own spec's (`leftFor`).
 */
const CONTRACTS = 'a published contracts bundle with an entity map';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('EntityPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    forgetBundleReads();
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

  /** The page of `entity` in qits-githost-service's bundle, its diagram refused. */
  async function openGithost(entity: string): Promise<OpenedRoute> {
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/repositories/${GITHOST}/entities/eu.wohlben.qits.githost.persistence.${entity}`,
    );
    await answerTwoSiteCatalog(opened);
    await answerFile(opened, 'qits-githost', 'entities.json', PROJECTION);
    if (entity === 'GitProject') {
      await answerFile(opened, 'qits-projects', 'entities.json', ENTITY_MAP);
    }
    await answerFile(opened, 'qits-githost', 'golden-masters/index.json', INDEX);
    http
      .expectOne((req) => req.url.endsWith('/database/index.json'))
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    return opened;
  }

  /** The outcomes recorded so far, as `interaction:outcome`. */
  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('links the entity a projection projects', async () => {
    const opened = await openGithost('GitProject');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('link', { name: 'qits-projects:Project' })).toBeVisible();
    await expect.element(view.getByRole('link', { name: '← All entities' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('projection', { kind: 'DATA' });
  });

  it('open-entity-relation projectionOf: a projection opens the entity it projects', async () => {
    const opened = await openGithost('GitProject');
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'qits-projects:Project' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['open-entity-relation:projectionOf']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/qits-projects-service/entities/eu.wohlben.qits.entities.domain.Project`,
    );
  });

  it('leave-entity allEntities: “← All entities” goes back to the list', async () => {
    const opened = await openGithost('GitProject');
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: '← All entities' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['leave-entity:allEntities']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/${GITHOST}/entities`,
    );
  });

  it('links the states recording an operation that hands the entity out', async () => {
    const opened = await openGithost('GitRepository');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('Recorded in');
    await expect
      .element(view.getByRole('link', { name: 'a git project with a repository' }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('recorded-in', { kind: 'DATA' });
  });

  it('open-entity-relation recordedIn: a recording state opens its page', async () => {
    const opened = await openGithost('GitRepository');
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'a git project with a repository' }).click();
    await commands.parkPointer();
    await leftFor(opened);
    expect(fired()).toEqual(['open-entity-relation:recordedIn']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/${GITHOST}/contracts/a-git-project-with-a-repository`,
    );
  });
});
