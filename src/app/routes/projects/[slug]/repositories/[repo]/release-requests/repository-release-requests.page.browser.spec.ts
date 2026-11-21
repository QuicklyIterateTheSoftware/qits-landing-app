import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const REPOSITORIES = 'a project with 3 repositories';
/** contract-service's whole history: rr-3 withdrawn, rr-2 released, rr-1 finalized. */
const ALL = 'a repository with a release not merged to main';
/** contract-service's open requests: rr-2 and rr-1, both pending. */
const OPEN = 'a frozen release request with a queued next request';
const NOW = new Date('2026-01-01T02:00:00Z');

/**
 * Screenshots of a repository's Release requests page (qits-2506): `contract-service` of
 * qits-projects' "a project with 3 repositories", its requests from "a repository with a release
 * not merged to main" (`state=all`, the default and the released and closed filters) and "a frozen
 * release request with a queued next request" (the open ones, no state). The repository's id is
 * the recorded listing's, answered by URL. A row opens the request under the repository
 * (`open-repository-release-request`); the sidebar's other entries are followed from here
 * (`open-sidebar-repository-page`).
 */
describe('RepositoryReleaseRequestsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  /** The page at `query`, the repositories answered; `requests` its read, still open. */
  async function open(query = '') {
    await page.viewport(1140, 900);
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/repositories/contract-service/release-requests${query}`,
    );
    const repositories = await goldenMaster(REPOSITORIES, 'listProjectRepositories');
    http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`).flush(repositories);
    await opened.settled();
    const repoId = repositories.entries.find(
      (entry: { repository?: { name?: string } }) => entry.repository?.name === 'contract-service',
    ).repository.id;
    return {
      opened,
      requests: (): TestRequest =>
        http.expectOne(
          (r) => r.url.split('?')[0] === `/projects/api/repositories/${repoId}/release-requests`,
        ),
    };
  }

  async function render(query = '', state = ALL): Promise<OpenedRoute> {
    const reads = await open(query);
    reads.requests().flush(await goldenMaster(state, 'listRepositoryReleaseRequests'));
    await reads.opened.settled();
    return reads.opened;
  }

  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const pending = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of pending) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = pending.length ? 0 : quiet + 1;
    }
  }

  const rows = (opened: OpenedRoute) =>
    [...opened.page.querySelectorAll('ul[aria-label="Release requests"] li a')].map((a) =>
      a.textContent?.trim(),
    );
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);
  const sidebar = () => page.getByRole('navigation', { name: 'qits' });

  it('lists every request by default, newest first, past released ones included', async () => {
    const reads = await open();
    const request = reads.requests();
    expect(request.request.urlWithParams).toContain('state=all');
    request.flush(await goldenMaster(ALL, 'listRepositoryReleaseRequests'));
    await reads.opened.settled();
    expect(rows(reads.opened)).toEqual([
      'contract-service-rr-3',
      'contract-service-rr-2',
      'contract-service-rr-1',
    ]);
    await expect
      .element(sidebar().getByRole('link', { name: 'Release requests' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(reads.opened.frame))
      .toMatchScreenshot('all', { kind: 'DATA' });
    await shootShellMenus(reads.opened, 'all');
  });

  it('narrows to the released ones at ?state=released', async () => {
    const opened = await render('?state=released');
    expect(rows(opened)).toEqual(['contract-service-rr-2', 'contract-service-rr-1']);
  });

  it('narrows to the rejected and withdrawn ones at ?state=closed', async () => {
    const opened = await render('?state=closed');
    expect(rows(opened)).toEqual(['contract-service-rr-3']);
  });

  it('asks for the open ones at ?state=open', async () => {
    const reads = await open('?state=open');
    const request = reads.requests();
    expect(request.request.urlWithParams).not.toContain('state=');
    request.flush(await goldenMaster(OPEN, 'listRepositoryReleaseRequests'));
    await reads.opened.settled();
    expect(rows(reads.opened)).toEqual(['contract-service-rr-2', 'contract-service-rr-1']);
    await expect
      .element(page.elementLocator(reads.opened.frame))
      .toMatchScreenshot('open', { kind: 'DATA' });
  });

  it('says when nothing matches the filter', async () => {
    const reads = await open('?state=open');
    reads.requests().flush(await goldenMaster(ALL, 'listRepositoryReleaseRequests'));
    await reads.opened.settled();
    await expect
      .element(page.elementLocator(reads.opened.page))
      .toMatchTextContent('No release request of contract-service matches this filter.');
    await expect
      .element(page.elementLocator(reads.opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('open-repository-release-request request: a row opens the request under the repository', async () => {
    const opened = await render();
    await userEvent.click(
      page.elementLocator(opened.page).getByRole('link', { name: 'contract-service-rr-2' }),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-service/release-requests/contract-service-rr-2`,
    );
    expect(reached()).toEqual(['open-repository-release-request:request']);
  });

  it.each([
    ['artifacts', 'Artifacts', '/artifacts'],
    ['docs', 'Docs', '/docs'],
    ['contracts', 'Contracts', '/contracts'],
    ['entities', 'Entities', '/entities'],
    ['uiBuilder', 'UI builder', '/ui-builder'],
  ])('open-sidebar-repository-page %s: the sidebar’s %s opens it', async (key, label, rest) => {
    const opened = await render();
    await userEvent.click(sidebar().getByRole('link', { name: label, exact: true }));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-service${rest}`,
    );
    expect(reached()).toEqual([`open-sidebar-repository-page:${key}`]);
  });

  it('follow-breadcrumb repository: the trail’s repository opens its page', async () => {
    const opened = await render();
    await userEvent.click(
      page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: 'contract-service' })
        .last(),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-service`,
    );
    expect(reached()).toEqual(['follow-breadcrumb:repository']);
  });

  it('follow-breadcrumb repositories: the trail’s Repositories opens the project’s list', async () => {
    const opened = await render();
    await userEvent.click(
      page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: 'Repositories' })
        .last(),
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/repositories`);
    expect(reached()).toEqual(['follow-breadcrumb:repositories']);
  });
});
