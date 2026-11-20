import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../api/system/client/client.gen';
import type { SwarmService } from '$core/system/swarm.consumes';
import { systemGoldenMaster } from '../../../../../testing/golden-masters';
import { SwarmServicesPage } from './swarm-services.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const SERVICES = '/system/api/swarm/services';

/** The recorded swarm: `dev-qits-artifacts` and `dev-qits-ci`, both replicated `1/1`, no ports. */
const recorded = (): SwarmService[] =>
  systemGoldenMaster<SwarmService[]>('a single-node swarm', 'listSwarmServices');

/**
 * The swarm services page (qits-2344) on answers its screenshots cannot show yet, each derived
 * from qits-system's recorded swarm ("a single-node swarm"): an empty swarm (the recording with no
 * rows, as `docker service ls` answers a swarm running none), and the states a replicas string
 * other than `1/1` derives (the recorded rows with their `replicas` changed). The live stream is
 * one that never sends: the page's `refreshOn` is its browser spec's.
 */
describe('SwarmServicesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        // Each row's name links the service's page (qits-2345).
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Runs the page's effects and lets the client build its request. */
  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  /** The page, its one read answered with `answer`; the page's element. */
  async function shown(answer: SwarmService[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SwarmServicesPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SERVICES).flush(answer);
    await ticked();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('lists the recorded services in the server’s order, each Running', async () => {
    const element = await shown(recorded());
    const rows = [...element.querySelectorAll('tbody tr')];
    expect(rows.map((row) => text(row.querySelector('td')))).toEqual([
      'dev-qits-artifacts',
      'dev-qits-ci',
    ]);
    // Each name links the service's page, by its name (qits-2345).
    expect(rows.map((row) => row.querySelector('td a')?.getAttribute('href'))).toEqual([
      '/system/swarm/services/dev-qits-artifacts',
      '/system/swarm/services/dev-qits-ci',
    ]);
    expect(rows.map((row) => text(row.querySelector('ui-chip')))).toEqual(['Running', 'Running']);
    expect(text(element.querySelector('[data-lede]'))).toBe('2 services');
    // No published port is a dash, not an empty cell.
    expect(rows.map((row) => text(row.querySelector('td:last-child')))).toEqual(['—', '—']);
  });

  it('says an empty swarm runs no services, with no table', async () => {
    // The recording with no rows: what the door answers for a swarm running none.
    const element = await shown(recorded().slice(0, 0));
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'This swarm is running no services.',
    );
    expect(element.querySelector('table')).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('0 services');
  });

  it('derives each row’s state from its replicas', async () => {
    // The recorded rows, their replicas changed to a service that is down and one not counted.
    const [down, global] = recorded();
    const element = await shown([
      { ...down, replicas: '0/1' },
      { ...global, mode: 'global', replicas: 'global' },
    ]);
    const chips = [...element.querySelectorAll('tbody ui-chip')].map((chip) => text(chip));
    expect(chips).toEqual(['Down', '—']);
  });

  it('says a 503 is the swarm not answering, and a 403 a missing role', async () => {
    const fixture = TestBed.createComponent(SwarmServicesPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SERVICES).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The swarm cannot be read right now.',
    );

    const refused = TestBed.createComponent(SwarmServicesPage);
    refused.detectChanges();
    await ticked();
    http.expectOne(SERVICES).flush(null, { status: 403, statusText: 'Forbidden' });
    await ticked();
    refused.detectChanges();
    const refusal = refused.nativeElement as HTMLElement;
    expect(text(refusal.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(refusal.querySelector('ui-load-failure')).toBeNull();
  });
});
