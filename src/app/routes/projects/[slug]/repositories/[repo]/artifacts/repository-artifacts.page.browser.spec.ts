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

const RELEASED = 'released artifacts, some behind';
const CATALOG = 'a docs catalog naming contract repositories';
/** A few days after the recorded releases, so "how long ago" is stable. */
const NOW = new Date('2026-01-20T00:00:00Z');

/**
 * Screenshots of a repository's Artifacts page (qits-2492) inside the shell, with the repository
 * sidebar open: `contract-service`'s artifacts from qits-maintenance's "released artifacts, some
 * behind" and its docs site from qits-artifacts' "a docs catalog naming contract repositories".
 * The sidebar's entries and its way back are followed once each.
 */
describe('RepositoryArtifactsPage (screenshots)', () => {
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

  async function render(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/repositories/contract-service/artifacts`,
    );
    http
      .expectOne('/maintenance/api/artifacts')
      .flush(await goldenMaster(RELEASED, 'listArtifacts', 'qits-maintenance'));
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster(CATALOG, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    return opened;
  }

  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const pending = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of pending) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = pending.length ? 0 : quiet + 1;
    }
  }

  const sidebar = () => page.getByRole('navigation', { name: 'qits' });
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('lists what the repository publishes, with the repository sidebar open', async () => {
    const opened = await render();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { level: 1 })).toHaveTextContent('Artifacts');
    await expect.element(view.getByRole('link', { name: 'qits/contract-service' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: '@contracts/contract-service' }))
      .toBeVisible();
    const entries = sidebar().getByRole('list', { name: 'Repository' }).getByRole('link');
    expect(entries.elements().map((a) => a.textContent?.trim())).toEqual([
      '← Repositories',
      'Overview',
      'Artifacts',
      'Docs',
      'Contracts',
      'Entities',
      'UI builder',
    ]);
    await expect
      .element(sidebar().getByRole('link', { name: 'Artifacts' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(sidebar().getByRole('link', { name: 'Overview' }))
      .not.toHaveAttribute('aria-current');
    // The project's sections are not rendered while a repository is open.
    expect(sidebar().getByRole('link', { name: 'Work', exact: true }).query()).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('populated', { kind: 'DATA' });
    await shootShellMenus(opened, 'populated');
  });

  it('open-sidebar-repository-page overview: Overview opens the repository’s page', async () => {
    const opened = await render();
    await userEvent.click(sidebar().getByRole('link', { name: 'Overview' }));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-service`,
    );
    expect(reached()).toEqual(['open-sidebar-repository-page:overview']);
  });

  it('leave-sidebar-repository repositories: “← Repositories” goes back to the project', async () => {
    const opened = await render();
    await userEvent.click(sidebar().getByRole('link', { name: '← Repositories' }));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/repositories`);
    expect(reached()).toEqual(['leave-sidebar-repository:repositories']);
    await expect.element(sidebar().getByRole('link', { name: 'Work', exact: true })).toBeVisible();
  });
});
