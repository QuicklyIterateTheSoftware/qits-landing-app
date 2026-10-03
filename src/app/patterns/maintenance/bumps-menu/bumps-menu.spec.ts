import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { PENDING_BUMPS } from '$core/maintenance/maintenance.consumes';
import { maintenanceGoldenMaster } from '../../../../testing/golden-masters';
import { BUMP_EVENTS, BumpsMenu, REFRESH_DEBOUNCE_MS } from './bumps-menu';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('BumpsMenu', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  let names: readonly string[];
  const LIST = `/maintenance/api/bumps/pending?limit=${PENDING_BUMPS}`;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(maintenanceClient),
        {
          provide: DomainEvents,
          useValue: {
            on: (wanted: readonly string[]) => {
              names = wanted;
              return events.asObservable();
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(BumpsMenu);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    const panel = element.querySelector<HTMLElement>('#bumps-menu')!;
    return { fixture, button, panel };
  }

  async function opened() {
    const rendered = render();
    rendered.button.click();
    rendered.fixture.detectChanges();
    await settle();
    http.expectOne(LIST).flush(maintenanceGoldenMaster('pending bumps', 'listPendingBumps'));
    await settle();
    rendered.fixture.detectChanges();
    return rendered;
  }

  it('fetches the bumps on its first opening, and lists the pending ones', async () => {
    const { button, panel } = await opened();
    expect(button.getAttribute('aria-label')).toBe('Version bumps');
    const rows = [...panel.querySelectorAll('ui-spinner > ul > li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain('contract-service');
    expect(rows[0]).toContain('TARGETED');
    expect(rows[0]).toContain('REQUESTED');
    expect(rows[0]).toContain('qits/build-images/ci-base 2026.1.1 → 2026.2.1 docker');
    expect(rows[2]).toContain('RELEASE OWED');
    expect(rows[3]).toContain('PENDING');
  });

  it('fetches again, once, after a burst of events that move bumps', async () => {
    const { fixture } = await opened();
    expect(names).toEqual(BUMP_EVENTS);
    vi.useFakeTimers();
    events.next({ id: '1', name: 'SoftwareRelease' });
    events.next({ id: '2', name: 'BuildSuccessful' });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
    http.expectOne(LIST).flush(maintenanceGoldenMaster('no pending bumps', 'listPendingBumps'));
    await settle();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#bumps-menu')?.textContent,
    ).toContain('No pending version bumps');
  });
});
