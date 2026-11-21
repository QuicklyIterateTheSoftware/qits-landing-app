import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { provideTestPlatformOrigins } from '../../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../../testing/browser/shell-menus';

/** An obsolete request, superseded mid-publish (qits-2039). */
const OBSOLETE = 'a repository with a tagged release whose request went obsolete mid-publish';

/** rr-1, frozen at the freeze's threshold, and rr-2, queued behind it (epic qits-1580). */
const FROZEN = 'a frozen release request with a queued next request';

/** Two hours after the recordings' instants, so "2 hours ago" stays put. */
const NOW = new Date('2026-01-01T02:00:00Z');

/**
 * Screenshots of one release request opened under its repository (qits-2506): the release request
 * view, mounted at `repositories/contract-service/release-requests/<ref>`, so the repository
 * sidebar stays open, the trail reads Repositories › contract-service › Release requests › <ref>,
 * and its links stay under the repository: “← Release requests” (`leave-repository-release-request`)
 * and the other requests it names (`open-related-repository-release-request`), each followed once,
 * on the states the project route's spec follows them on. The fold's reads, which those states do
 * not record, answer with an error.
 */
describe('RepositoryReleaseRequestPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideAppRoute(), provideTestPlatformOrigins({}, { ci: 'https://ci.test' })],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    vi.useRealTimers();
    failCi();
    http.verify();
    await page.viewport(800, 600);
  });

  function failCi(): number {
    const calls = http.match((r) => r.url.startsWith('/ci/'));
    for (const call of calls) call.flush(null, { status: 500, statusText: 'Server Error' });
    return calls.length;
  }

  /** The request `ref` under contract-service, read with `state`'s `operationId` recording. */
  async function shown(state: string, operationId: string, ref: string, tab?: string) {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    await page.viewport(1140, 700);
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/repositories/contract-service/release-requests/` +
        encodeURIComponent(ref) +
        (tab ? `?tab=${tab}` : ''),
    );
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
      .flush(await goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
    await opened.settled();
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/release-requests/${ref}`)
      .flush(await goldenMaster(state, operationId));
    for (let round = 0; round < 3; round++) {
      await opened.settled();
      for (const call of http.match((r) => r.url.startsWith('/projects/api/repositories/'))) {
        call.flush(null, { status: 404, statusText: 'Not Found' });
      }
      failCi();
    }
    await opened.settled();
    await page.viewport(1140, 1600);
    return { opened, view: page.elementLocator(opened.page) };
  }

  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const pending = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of pending) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = pending.length ? 0 : quiet + 1;
    }
  }

  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);
  const url = () => TestBed.inject(Router).url;
  const under = (opened: OpenedRoute, rest = '') =>
    `/projects/${opened.project.slug}/repositories/contract-service/release-requests${rest}`;

  async function obsolete() {
    const recorded = await goldenMaster(OBSOLETE, 'getProjectReleaseRequest');
    return shown(OBSOLETE, 'getProjectReleaseRequest', recorded.request.qualifiedId);
  }

  async function frozen(tab?: string) {
    const recorded = await goldenMaster(FROZEN, 'getReleaseRequest');
    return shown(FROZEN, 'getReleaseRequest', recorded.request.id, tab);
  }

  async function queued() {
    const recorded = await goldenMaster(FROZEN, 'getProjectReleaseRequest');
    return shown(FROZEN, 'getProjectReleaseRequest', recorded.request.qualifiedId);
  }

  it('keeps the repository’s sidebar and trail around the request', async () => {
    const { opened, view } = await obsolete();
    await expect
      .element(view.getByRole('link', { name: 'Open the request that superseded it' }))
      .toBeVisible();
    const sidebar = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(sidebar.getByRole('link', { name: 'Release requests' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent('contract-service');
    await expect
      .element(view.getByRole('link', { name: '← Release requests' }))
      .toHaveAttribute('href', under(opened));
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('obsolete', { kind: 'DATA' });
    await shootShellMenus(opened, 'obsolete');
  });

  it('leave-repository-release-request list: “← Release requests” opens the repository’s list', async () => {
    const { opened, view } = await obsolete();
    await view.getByRole('link', { name: '← Release requests' }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['leave-repository-release-request:list']);
    expect(url()).toBe(under(opened));
  });

  it('follow-breadcrumb repositoryReleaseRequests: the trail’s Release requests opens the list', async () => {
    const { opened } = await obsolete();
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Release requests' })
      .last()
      .click();
    await leftFor(opened);
    expect(fired()).toEqual(['follow-breadcrumb:repositoryReleaseRequests']);
    expect(url()).toBe(under(opened));
  });

  it('open-related-repository-release-request supersededBy: stays under the repository', async () => {
    const recorded = await goldenMaster(OBSOLETE, 'getProjectReleaseRequest');
    const { opened, view } = await obsolete();
    await view.getByRole('link', { name: 'Open the request that superseded it' }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-related-repository-release-request:supersededBy']);
    expect(url()).toBe(under(opened, `/${recorded.request.supersededBy}`));
  });

  it('open-related-repository-release-request queuedNext: “next:” stays under the repository', async () => {
    const { opened, view } = await frozen();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('frozen', { kind: 'DATA' });
    await view.getByRole('link', { name: 'next: contract-service-rr-2' }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-related-repository-release-request:queuedNext']);
    expect(url()).toBe(under(opened, '/contract-service-rr-2'));
  });

  it('open-related-repository-release-request queuedBehind: stays under the repository', async () => {
    const { opened, view } = await queued();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('queued', { kind: 'DATA' });
    await view.getByRole('link', { name: 'queued behind contract-service-rr-1' }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-related-repository-release-request:queuedBehind']);
    expect(url()).toBe(under(opened, '/contract-service-rr-1'));
  });

  /** rr-1 with `ticket/contract-11` moved to the next request, on its Overview (as the project's spec). */
  async function moved() {
    const { opened, view } = await frozen('commits');
    const request = (await goldenMaster(FROZEN, 'getReleaseRequest')).request;
    const press = (name: string) =>
      (view.getByRole('button', { name, exact: true }).first().element() as HTMLElement).click();
    press('Move to next request');
    await opened.settled();
    await view
      .getByRole('textbox', { name: 'Reason for moving ticket/contract-11 to the next request' })
      .fill('It conflicts with ticket/contract-11.');
    await opened.settled();
    press('Move');
    await opened.settled();
    http
      .expectOne(
        `/projects/api/repositories/${request.repoId}/release-requests/${request.id}/sources/move`,
      )
      .flush(await goldenMaster(FROZEN, 'moveReleaseRequestSource'));
    for (let round = 0; round < 3; round++) {
      await opened.settled();
      for (const call of http.match((r) => r.url.startsWith('/projects/api/repositories/'))) {
        call.flush(null, { status: 404, statusText: 'Not Found' });
      }
      failCi();
    }
    await view
      .getByRole('navigation', { name: 'Release request views' })
      .getByRole('link', { name: /Overview/ })
      .click();
    await opened.settled();
    return { opened, moves: view.getByRole('region', { name: 'Moved sources' }) };
  }

  it('open-related-repository-release-request movedFrom: stays under the repository', async () => {
    const { opened, moves } = await moved();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('moved', { kind: 'DATA' });
    await moves.getByRole('link', { name: 'contract-service-rr-1', exact: true }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-related-repository-release-request:movedFrom']);
    expect(url()).toBe(under(opened, '/contract-service-rr-1'));
  });

  it('open-related-repository-release-request movedTo: stays under the repository', async () => {
    const { opened, moves } = await moved();
    await moves.getByRole('link', { name: 'contract-service-rr-2', exact: true }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-related-repository-release-request:movedTo']);
    expect(url()).toBe(under(opened, '/contract-service-rr-2'));
  });
});
