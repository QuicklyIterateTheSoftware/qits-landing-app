import { HttpTestingController } from '@angular/common/http/testing';
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

/**
 * Screenshots of a repository's Dependents page inside the shell (`openRoute`, qits-2489), at
 * `contract-service` of qits-projects' "a project with 3 repositories" (its id answered by URL).
 * Its qits-maintenance reads are answered from "a repository with pins and bumps" (contract-core
 * embedded by a behind daemon and a current service, three repositories downstream over two
 * levels) or "a repository with nothing pinned" (empty), which the page does not check against
 * the name; its releases from "a repository with a release not merged to main" (rr-2 released,
 * rr-1 finalized) or "a frozen release request with a queued next request" (two pending, none
 * released), and the newest one's journey from "a release some consumers adopted". A
 * refusal is a 403 with no body. A dependent opens its own Depends on
 * (`open-repository-depends-on`), a release its adoption page (`open-repository-adoption`); the
 * sidebar's Depends on is followed from here (`open-sidebar-repository-page`).
 */
const PINS_AND_BUMPS = 'a repository with pins and bumps';
const NOTHING_PINNED = 'a repository with nothing pinned';
const REPOSITORIES = 'a project with 3 repositories';
const RELEASES = 'a repository with a release not merged to main';
/** contract-service's open requests only: two pending, none released yet. */
const UNRELEASED = 'a frozen release request with a queued next request';
const ADOPTED = 'a release some consumers adopted';
const REPO = 'contract-service';
const NEWEST = '2026.101.100400';

describe('RepositoryDependentsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The page, the project's repositories answered; the other reads still open. */
  async function open(height = 1000) {
    await page.viewport(1140, height);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/components/${REPO}/dependents`,
    );
    const repositories = await goldenMaster(REPOSITORIES, 'listProjectRepositories');
    http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`).flush(repositories);
    await opened.settled();
    const repoId = repositories.entries.find(
      (entry: { repository?: { name?: string } }) => entry.repository?.name === REPO,
    ).repository.id;
    const reads = {
      dependents: () => http.expectOne(`/maintenance/api/repositories/${REPO}/dependents`),
      downstream: () => http.expectOne(`/maintenance/api/repositories/${REPO}/downstream`),
      requests: () =>
        http.expectOne(
          (r) => r.url.split('?')[0] === `/projects/api/repositories/${repoId}/release-requests`,
        ),
      adoption: () =>
        http.expectOne((r) => r.url.split('?')[0] === '/maintenance/api/adoption/by-release'),
    };
    return { opened, reads, view: page.elementLocator(opened.page) };
  }

  /** The page with every read answered from `state` (the inventory's) and the releases. */
  async function render(state = PINS_AND_BUMPS, height?: number) {
    const rendered = await open(height);
    const { opened, reads } = rendered;
    reads
      .dependents()
      .flush(await goldenMaster(state, 'listRepositoryDependents', 'qits-maintenance'));
    reads
      .downstream()
      .flush(await goldenMaster(state, 'getRepositoryDownstream', 'qits-maintenance'));
    reads.requests().flush(await goldenMaster(RELEASES, 'listRepositoryReleaseRequests'));
    await opened.settled();
    reads.adoption().flush(await goldenMaster(ADOPTED, 'getAdoptionByRelease', 'qits-maintenance'));
    await opened.settled();
    return rendered;
  }

  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const pending = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of pending) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = pending.length ? 0 : quiet + 1;
    }
  }

  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);
  const sidebar = () => page.getByRole('navigation', { name: 'qits' });

  it('shows who embeds the repository, what is downstream and how far its releases got', async () => {
    const { opened, view } = await render(PINS_AND_BUMPS, 1300);
    await expect.element(view.getByText('eu.wohlben.qits:contract-core')).toBeVisible();
    await expect.element(view.getByRole('link', { name: 'contract-daemon' }).first()).toBeVisible();
    await expect.element(view.getByText('3 repositories downstream')).toBeVisible();
    await expect
      .element(view.getByRole('list', { name: 'Releases' }))
      .toMatchTextContent(/2026\.101\.100400.*2026\.101\.100100/);
    await expect.element(view.getByText(new RegExp(`downstream carry ${NEWEST}`))).toBeVisible();
    await expect
      .element(sidebar().getByRole('link', { name: 'Dependents' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('dependents', { kind: 'DATA' });
    await shootShellMenus(opened, 'dependents');
  });

  it('says each section is empty for a repository nothing embeds and with no release', async () => {
    const { opened, reads, view } = await open();
    reads
      .dependents()
      .flush(await goldenMaster(NOTHING_PINNED, 'listRepositoryDependents', 'qits-maintenance'));
    reads
      .downstream()
      .flush(await goldenMaster(NOTHING_PINNED, 'getRepositoryDownstream', 'qits-maintenance'));
    reads.requests().flush(await goldenMaster(UNRELEASED, 'listRepositoryReleaseRequests'));
    await opened.settled();
    await expect
      .element(view.getByText('Nothing of ours embeds what contract-service publishes.'))
      .toBeVisible();
    await expect
      .element(view.getByText('Nothing is downstream of contract-service.'))
      .toBeVisible();
    await expect.element(view.getByText('contract-service has no release yet.')).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs a staff role', async () => {
    const { opened, reads, view } = await open();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    reads.dependents().flush(null, { status: 403, statusText: 'Forbidden' });
    reads.downstream().flush(null, { status: 403, statusText: 'Forbidden' });
    reads.requests().flush(await goldenMaster(UNRELEASED, 'listRepositoryReleaseRequests'));
    await opened.settled();
    await expect.element(view.getByRole('alert').first()).toMatchTextContent('needs a staff role');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('open-repository-depends-on repository: a dependent opens its own Depends on', async () => {
    const { opened, view } = await render();
    await view.getByRole('link', { name: 'contract-daemon' }).first().click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/contract-daemon/depends-on`,
    );
    expect(reached()).toEqual(['open-repository-depends-on:repository']);
  });

  it('open-repository-adoption release: a release opens its adoption page', async () => {
    const { opened, view } = await render();
    await view.getByRole('link', { name: NEWEST }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/${REPO}/adoption/${NEWEST}`,
    );
    expect(reached()).toEqual(['open-repository-adoption:release']);
  });

  it('open-sidebar-repository-page dependsOn: the sidebar’s Depends on opens it', async () => {
    const { opened } = await render();
    await userEvent.click(sidebar().getByRole('link', { name: 'Depends on', exact: true }));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/${REPO}/depends-on`,
    );
    expect(reached()).toEqual(['open-sidebar-repository-page:dependsOn']);
  });
});
