import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of a release's adoption page inside the shell (`openRoute`, qits-2333; under its
 * repository since qits-2489), at the
 * recorded project's slug (qits-projects' "a project exists"), its one read
 * (`getAdoptionByRelease`) answered from qits-maintenance's golden masters, each at the release it
 * records (contract-ui-jslib@2026.905.1, publishing npm `@qits/contract-ui`): "a repository with
 * downstream components" (`pending`: contract-frontend one hop out, contract-service two, both
 * PENDING), "a release some consumers adopted" (`populated`: contract-admin-frontend PENDING and
 * contract-frontend ADOPTED at 2026.905.2 one hop out, contract-service two hops out reached from
 * both) and "a release nobody consumes" (`empty`), the last two from
 * `@qits/maintenance-golden-masters` 2026.1119.183438 on. A refusal is a 403 with no body,
 * as the service answers a credential without a staff role; a failure a 500. A release with no
 * package is no recording's: the plain spec covers it.
 *
 * Its exit (`open-repository-depends-on` `repository`) is followed once: an adopter's card opens
 * the repository's Depends on page in this app.
 */
const PENDING = 'a repository with downstream components';
const ADOPTED = 'a release some consumers adopted';
const NOBODY = 'a release nobody consumes';

/** The release every state records its journey for. */
const RELEASE = { repository: 'contract-ui-jslib', version: '2026.905.1' };
const ADOPTION_URL = `/maintenance/api/adoption/by-release?repository=${RELEASE.repository}&version=${RELEASE.version}`;

describe('RepositoryAdoptionPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The release's page, its read still open; wide and tall enough for the whole chart. */
  async function open(width = 1140, height = 900) {
    await page.viewport(width, height);
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/components/${RELEASE.repository}/adoption/${RELEASE.version}`,
    );
    return { opened, read: () => http.expectOne(ADOPTION_URL) };
  }

  /** The page of the journey `state` recorded, answered. */
  async function render(state: string, width?: number) {
    const { opened, read } = await open(width);
    read().flush(await goldenMaster(state, 'getAdoptionByRelease', 'qits-maintenance'));
    await opened.settled();
    return { opened, view: page.elementLocator(opened.page) };
  }

  const card = (root: Element, repository: string) =>
    root.querySelector<HTMLElement>(`[data-card][data-repository="${repository}"]`);

  it('shows a release both its downstream repositories are still waiting for', async () => {
    const { opened, view } = await render(PENDING);
    await expect
      .element(view.getByRole('heading', { level: 2 }))
      .toMatchTextContent('contract-ui-jslib@2026.905.1');
    await expect.element(view.getByText('npm @qits/contract-ui')).toBeVisible();
    await expect
      .element(view.getByText('2 repositories downstream of this release, 0 carrying it.'))
      .toBeVisible();
    await expect.element(view.getByRole('link', { name: 'contract-frontend' })).toBeVisible();
    expect(opened.page.querySelectorAll('[data-card]')).toHaveLength(3);
    expect(opened.page.querySelectorAll('path[data-edge]')).toHaveLength(2);
    // PENDING is quiet: no alert anywhere.
    expect(
      [...opened.page.querySelectorAll('[role="alert"]')].filter((a) => !a.closest('.hidden')),
    ).toEqual([]);
    // The repository sidebar keeps Dependents current.
    await expect
      .element(
        page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Dependents' }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('pending', { kind: 'DATA' });
    await shootShellMenus(opened, 'pending');
  });

  it('shows a release some consumers adopted, one repository reached from two', async () => {
    const { opened, view } = await render(ADOPTED);
    await expect
      .element(view.getByText('3 repositories downstream of this release, 1 carrying it.'))
      .toBeVisible();
    const adopted = card(opened.page, 'contract-frontend')!;
    expect(adopted.querySelector('[data-state]')?.textContent?.trim()).toBe('ADOPTED');
    expect(adopted.textContent).toContain('2026.905.2');
    const service = card(opened.page, 'contract-service')!;
    expect(service.dataset['column']).toBe('2');
    expect(service.textContent).toContain(
      'Reached from contract-admin-frontend, contract-frontend.',
    );
    expect(opened.page.querySelectorAll('path[data-to="contract-service"]')).toHaveLength(2);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('populated', { kind: 'DATA' });
  });

  it('scrolls the chart inside its own box on a phone, never the page', async () => {
    const { opened } = await render(PENDING, 390);
    const box = opened.page.querySelector<HTMLElement>('[data-scroll]')!;
    expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it('says a release nobody consumes reached no repository', async () => {
    const { opened, view } = await render(NOBODY);
    await expect.element(view.getByText('This release reached no repository.')).toBeVisible();
    expect(opened.page.querySelector('[data-chart]')).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs a staff role', async () => {
    const { opened, read } = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read().flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect.element(view.getByRole('alert').first()).toMatchTextContent('needs a staff role');
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('says a failed read could not be read, and Retry reads it again', async () => {
    const { opened, read } = await open();
    read().flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByText(/could not be read/)).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('failed', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    http
      .expectOne(ADOPTION_URL)
      .flush(await goldenMaster(PENDING, 'getAdoptionByRelease', 'qits-maintenance'));
    await opened.settled();
    await expect.element(view.getByRole('link', { name: 'contract-frontend' })).toBeVisible();
  });

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('open-repository-depends-on repository: an adopter’s card opens its Depends on page', async () => {
    const { opened, view } = await render(PENDING);
    await view.getByRole('link', { name: 'contract-frontend' }).click();
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-repository-depends-on:repository',
    ]);
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/contract-frontend/depends-on`,
    );
  });

  it('follow-breadcrumb repositoryDependents: the trail’s Dependents opens the repository’s', async () => {
    const { opened } = await render(PENDING);
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(`${RELEASE.repository}›Dependents›${RELEASE.version}`);
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Dependents' })
      .last()
      .click();
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'follow-breadcrumb:repositoryDependents',
    ]);
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/${RELEASE.repository}/dependents`,
    );
  });
});
