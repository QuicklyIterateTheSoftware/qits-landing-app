import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as maintenanceClient } from '../../../../../../../api/maintenance/client.gen';
import { client as projectsClient } from '../../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../../api/projects/client/client.gen';
import {
  goldenMaster,
  maintenanceGoldenMaster,
} from '../../../../../../../../testing/golden-masters';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { MaintenanceAdoptionPage, packagesLine } from './maintenance-adoption.page';

/**
 * The adoption page (qits-2333), its one read answered with qits-maintenance's recording of "a
 * repository with downstream components" (contract-ui-jslib@2026.905.1, publishing npm
 * `@qits/contract-ui`; contract-frontend one hop out and contract-service two, both PENDING), "a
 * release some consumers adopted" (contract-frontend ADOPTED at 2026.905.2, contract-service reached
 * from both frontends) and "a release nobody consumes" (no adopter), all of the same release. The
 * cases no recording holds are derived from the first, each saying how: an adopter ABSENT or not
 * in the inventory, no package. The open project is qits-projects' recorded one.
 */
const DOWNSTREAM = 'a repository with downstream components';
const ADOPTED = 'a release some consumers adopted';
const NOBODY = 'a release nobody consumes';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('MaintenanceAdoptionPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const journey = () => maintenanceGoldenMaster(DOWNSTREAM, 'getAdoptionByRelease');
  const release = { repository: 'contract-ui-jslib', version: '2026.905.1' };

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/maintenance/adoption/:repository/:version',
            component: MaintenanceAdoptionPage,
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(maintenanceClient),
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  const ADOPTION_URL = `/maintenance/api/adoption/by-release?repository=${release.repository}&version=${release.version}`;
  const adoptionRead = () => http.expectOne(ADOPTION_URL);

  /** The page of the recorded release, its read answered with `body` at `status`. */
  async function render({ body = journey() as unknown, status = 200 } = {}) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/maintenance/adoption/${release.repository}/${release.version}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    const read = adoptionRead();
    if (status === 200) read.flush(body as object);
    else read.flush(body as object, { status, statusText: 'Error' });
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const card = (element: HTMLElement, repository: string) =>
    element.querySelector<HTMLElement>(`[data-card][data-repository="${repository}"]`);
  const shownAlerts = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>('[role="alert"]')].filter(
      (alert) => !alert.closest('.hidden'),
    );

  it('names the release and what it published, and draws its journey column by column', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h2'))).toBe('contract-ui-jslib@2026.905.1');
    expect(text(element.querySelector('[data-packages]'))).toBe('npm @qits/contract-ui');
    expect(element.querySelector('[data-no-packages]')).toBeNull();
    expect(text(element.querySelector('[data-caption]'))).toBe(
      '2 repositories downstream of this release, 0 carrying it.',
    );
    const cards = [...element.querySelectorAll<HTMLElement>('[data-card]')];
    expect(cards.map((c) => [c.dataset['column'], c.dataset['repository']])).toEqual([
      ['0', 'contract-ui-jslib'],
      ['1', 'contract-frontend'],
      ['2', 'contract-service'],
    ]);
    const edges = [...element.querySelectorAll('path[data-edge]')].map(
      (p) => `${p.getAttribute('data-from')}->${p.getAttribute('data-to')}`,
    );
    expect(edges).toEqual([
      'contract-ui-jslib->contract-frontend',
      'contract-frontend->contract-service',
    ]);
    const heads = [...element.querySelectorAll('[data-column-head]')].map((head) =>
      [...head.children].map(text),
    );
    expect(heads).toEqual([
      ['This release'],
      ['1 hop downstream', '0/1 carrying it'],
      ['2 hops downstream', '0/1 carrying it'],
    ]);
    expect(shownAlerts(element)).toEqual([]);
  });

  it('draws a pending card quiet: a neutral chip, what it waits for, no version', async () => {
    const { element } = await render();
    const frontend = card(element, 'contract-frontend')!;
    expect(text(frontend.querySelector('[data-state]'))).toBe('PENDING');
    expect(frontend.querySelector('[data-state]')?.className).toContain('bg-surface-muted');
    expect(text(frontend)).toContain('has not released with it yet');
    const service = card(element, 'contract-service')!;
    expect(text(service)).toContain('SERVICE');
    expect(text(service)).toContain('waiting');
    expect(text(service)).toContain('Reached from contract-frontend.');
  });

  it('names the version an adopted card carries and when', async () => {
    const adopted = maintenanceGoldenMaster(ADOPTED, 'getAdoptionByRelease');
    const { element } = await render({ body: adopted });
    const frontend = card(element, 'contract-frontend')!;
    expect(text(frontend.querySelector('[data-state]'))).toBe('ADOPTED');
    expect(frontend.querySelector('[data-state]')?.className).toContain('bg-success-soft');
    expect(text(frontend)).toContain('2026.905.2');
    expect(text(frontend)).toContain('1 Jan 2026');
    expect(text(element.querySelector('[data-caption]'))).toBe(
      '3 repositories downstream of this release, 1 carrying it.',
    );
    // contract-service is one card, reached from both frontends.
    expect(
      element.querySelectorAll('[data-card][data-repository="contract-service"]'),
    ).toHaveLength(1);
    expect(element.querySelectorAll('path[data-to="contract-service"]')).toHaveLength(2);
    expect(
      element.querySelector('path[data-to="contract-frontend"]')?.getAttribute('class'),
    ).toContain('stroke-accent');
  });

  it('links each adopter the inventory holds to its repository page', async () => {
    const { element } = await render();
    const link = card(element, 'contract-frontend')!.querySelector<HTMLAnchorElement>('a')!;
    expect(link.getAttribute('href')).toBe(
      `/projects/${project.slug}/maintenance/repositories/contract-frontend`,
    );
    expect(link.getAttribute('title')).toBe('contract-frontend');
    expect(card(element, 'contract-ui-jslib')!.querySelector('a')).toBeNull();
  });

  it('draws an adopter the inventory does not hold, or that left the catalog, unlinked', async () => {
    // contract-frontend ABSENT and contract-service with no status, derived from the recording.
    const recorded = journey();
    const body = {
      ...recorded,
      adopters: [
        { ...recorded.adopters[0], repositoryStatus: 'ABSENT' },
        { ...recorded.adopters[1], repositoryStatus: null },
      ],
    };
    const { element } = await render({ body });
    expect(element.querySelectorAll('[data-card] a')).toHaveLength(0);
    expect(text(card(element, 'contract-frontend')!.querySelector('[data-absent]'))).toBe('absent');
    expect(card(element, 'contract-service')!.querySelector('[data-absent]')).toBeNull();
  });

  it('says a release reached no repository rather than drawing one card', async () => {
    const { element } = await render({
      body: maintenanceGoldenMaster(NOBODY, 'getAdoptionByRelease'),
    });
    expect(text(element.querySelector('[data-empty]'))).toBe('This release reached no repository.');
    expect(element.querySelector('[data-chart]')).toBeNull();
  });

  it('says so when the service holds no bill of materials, and still draws the closure', async () => {
    // No package, derived from the recording: no state records a release with no SBOM.
    const { element } = await render({ body: { ...journey(), packages: [] } });
    expect(element.querySelector('[data-packages]')).toBeNull();
    const notice = element.querySelector('[data-no-packages]');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(text(notice)).toContain('holds no bill of materials for this release');
    expect(element.querySelectorAll('[data-card]').length).toBeGreaterThan(1);
  });

  it('says a refusal needs a staff role on a 403', async () => {
    const { element } = await render({ body: null, status: 403 });
    const [alert] = shownAlerts(element);
    expect(alert.textContent).toContain('needs a staff role');
    expect(element.querySelector('ui-load-failure')?.className).toContain('hidden');
    expect(element.querySelector('[data-adoption]')).toBeNull();
  });

  it('offers Retry when the read fails otherwise', async () => {
    const { element } = await render({ body: null, status: 500 });
    expect(element.querySelector('ui-load-failure')?.className).not.toContain('hidden');
    expect(shownAlerts(element).map((a) => a.textContent)).not.toContain(
      expect.stringContaining('staff role'),
    );
  });

  it('reads the journey again after a release, debounced, and on Refresh', async () => {
    const { harness } = await render();
    vi.useFakeTimers();
    try {
      events.next({ name: 'SoftwareRelease', payload: '{}' } as DomainEvent);
      events.next({ name: 'SCMRelease', payload: '{}' } as DomainEvent);
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
    adoptionRead().flush(journey());
    await answered(harness);
    // Any other event reads nothing.
    events.next({ name: 'BuildSuccessful', payload: '{}' } as DomainEvent);
    await answered(harness);
    http.expectNone('/maintenance/api/adoption/by-release');

    const refresh = [...harness.routeNativeElement!.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Refresh',
    )!;
    refresh.click();
    await answered(harness);
    adoptionRead().flush(journey());
    await answered(harness);
  });

  it('joins what a release published as `ecosystem name`', () => {
    expect(
      packagesLine({
        packages: [
          { ecosystem: 'maven', name: 'eu.wohlben.qits:qits-eventstream' },
          { ecosystem: 'npm', name: '@qits/x' },
        ],
      }),
    ).toBe('maven eu.wohlben.qits:qits-eventstream, npm @qits/x');
    expect(packagesLine({ packages: [] })).toBe('');
  });
});
