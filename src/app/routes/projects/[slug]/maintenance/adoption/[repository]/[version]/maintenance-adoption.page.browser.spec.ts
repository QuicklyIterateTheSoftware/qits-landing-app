import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { QITS_LEAVE_APP } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../../../testing/platform-origins';

/**
 * Screenshots of a release's adoption page inside the shell (`openRoute`, qits-2333), at the
 * recorded project's slug (qits-projects' "a project exists"), its one read
 * (`getAdoptionByRelease`) answered from qits-maintenance's golden masters, each at the release it
 * records (contract-ui-jslib@2026.905.1, publishing npm `@qits/contract-ui`): "a repository with
 * downstream components" (`pending`: contract-frontend one hop out, contract-service two, both
 * PENDING), "a release some consumers adopted" (`populated`: contract-admin-frontend PENDING and
 * contract-frontend ADOPTED at 2026.905.2 one hop out, contract-service two hops out reached from
 * both) and "a release nobody consumes" (`empty`). The last two are recorded from a later
 * qits-maintenance release than the pinned one: until the pin reaches them (and the pact holds
 * them), the reader refuses them and their tests skip themselves. A refusal is a 403 with no body,
 * as the service answers a credential without a staff role; a failure a 500. A release with no
 * package is no recording's: the plain spec covers it.
 *
 * Its exit (`open-adoption-repository` `open`) is followed once: an adopter's card leaves for the
 * repository's page in qits-maintenance-frontend, through `QITS_LEAVE_APP` (a spy, so the tab
 * stays).
 */
const PENDING = 'a repository with downstream components';
const ADOPTED = 'a release some consumers adopted';
const NOBODY = 'a release nobody consumes';

/** The release every state records its journey for. */
const RELEASE = { repository: 'contract-ui-jslib', version: '2026.905.1' };
const ADOPTION_URL = `/maintenance/api/adoption/by-release?repository=${RELEASE.repository}&version=${RELEASE.version}`;

/** The old maintenance app's page origin, so an adopter links its page (configuration, not data). */
const MAINTENANCE = 'https://maintenance.qits.example.test';

describe('MaintenanceAdoptionPage (screenshots)', () => {
  let http: HttpTestingController;
  const leave = vi.fn<(href: string) => void>();

  beforeEach(() => {
    leave.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        // `provideAppRoute()`'s page origins, and the maintenance app's.
        provideTestPlatformOrigins(
          {},
          {
            idp: 'https://idp.qits.example.test',
            artifacts: 'https://registry.qits.example.test',
            'network-access': 'https://network-access.qits.example.test',
            maintenance: MAINTENANCE,
          },
        ),
        { provide: QITS_LEAVE_APP, useValue: leave },
      ],
    });
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
        `/projects/${project.slug}/maintenance/adoption/${RELEASE.repository}/${RELEASE.version}`,
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

  /** Whether `state` is recorded in the pinned golden masters (and held by the pact). */
  const recorded = (state: string) =>
    goldenMaster(state, 'getAdoptionByRelease', 'qits-maintenance').then(
      () => true,
      () => false,
    );

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
    // The sidebar keeps Maintenance open below it.
    await expect
      .element(
        page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Maintenance' }),
      )
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('pending', { kind: 'DATA' });
    await shootShellMenus(opened, 'pending');
  });

  it('shows a release some consumers adopted, one repository reached from two', async (context) => {
    if (!(await recorded(ADOPTED))) context.skip();
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

  it('says a release nobody consumes reached no repository', async (context) => {
    if (!(await recorded(NOBODY))) context.skip();
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

  it('open-adoption-repository open: an adopter’s card leaves for its page in the maintenance app', async () => {
    const { opened, view } = await render(PENDING);
    await userEvent.click(view.getByRole('link', { name: 'contract-frontend' }));
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-adoption-repository:open',
    ]);
    expect(leave).toHaveBeenCalledWith(
      `${MAINTENANCE}/${opened.project.slug}/repositories/contract-frontend`,
    );
    // The click left through the spy, not the link: the router stays where it was.
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/maintenance/adoption/${RELEASE.repository}/${RELEASE.version}`,
    );
  });
});
