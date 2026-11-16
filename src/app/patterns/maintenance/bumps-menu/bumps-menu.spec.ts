import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { Subject } from 'rxjs';
import { client as edgeClient } from '../../../api/edge/client.gen';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { PENDING_BUMPS } from '$core/maintenance/maintenance.consumes';
import type { UpstreamPoolEntry } from '$core/edge/edge.consumes';
import { edgeGoldenMaster, maintenanceGoldenMaster } from '../../../../testing/golden-masters';
import { BUMP_EVENTS, BumpsMenu, REFRESH_DEBOUNCE_MS } from './bumps-menu';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Where the edge answers its pools: the page's own origin (`UPSTREAM_POOLS`, qits-2220). */
const POOLS = '/upstream-pools';

/** The pools the edge recorded: one ordinary pool to one origin. */
const RECORDED: readonly UpstreamPoolEntry[] = edgeGoldenMaster(
  'an open upstream pool',
  'getUpstreamPools',
);

/**
 * Both pools to the recorded origin, derived from the recording: the recorded (ordinary) pool, and
 * a copy of it as the stream pool with fewer connections open, after it as the edge sorts them
 * (fullest first). The edge records no state with a stream pool open.
 */
const BOTH_POOLS: readonly UpstreamPoolEntry[] = [
  RECORDED[0],
  { ...RECORDED[0], pool: 'stream', open: 0 },
];

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
        provideHeyApiClient(edgeClient),
        {
          provide: DomainEvents,
          useValue: {
            on: (wanted: readonly string[]) => {
              names = wanted;
              return events.asObservable();
            },
          },
        },
        // The bumps' resource follows the app's one stream, as `app.config.ts` provides it.
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
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

  /**
   * Opens the panel and flushes the bumps request. The pools request (`/upstream-pools`) is
   * flushed too, so every test leaves nothing outstanding for `http.verify()`: `pools` defaults to
   * an empty answer for tests that have nothing to say about the pools section, and `poolsOpts`
   * lets a pools-focused test answer with a non-2xx status.
   */
  async function opened(
    pools: readonly UpstreamPoolEntry[] | null = [],
    poolsOpts?: { status: number; statusText: string },
  ) {
    const rendered = render();
    rendered.button.click();
    rendered.fixture.detectChanges();
    await settle();
    http.expectOne(LIST).flush(maintenanceGoldenMaster('pending bumps', 'listPendingBumps'));
    http.expectOne(POOLS).flush(pools, poolsOpts);
    await settle();
    rendered.fixture.detectChanges();
    return rendered;
  }

  /** Each pool row: its name (and pool) and its `open/max`. */
  const poolRows = (panel: HTMLElement) =>
    [...panel.querySelectorAll('ui-spinner ~ ul > li')].map((li) =>
      [...li.children].map((span) => span.textContent?.replace(/\s+/g, ' ').trim()),
    );

  /** Closes the open panel (its trigger again), then opens it again. */
  async function reopen(rendered: ReturnType<typeof render>) {
    rendered.button.click();
    rendered.fixture.detectChanges();
    rendered.button.click();
    rendered.fixture.detectChanges();
    await settle();
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
    // The resource reads again on its next turn (qits-2146): let it run, then its request build.
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    await settle();
    http.expectOne(LIST).flush(maintenanceGoldenMaster('no pending bumps', 'listPendingBumps'));
    await settle();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#bumps-menu')?.textContent,
    ).toContain('No pending version bumps');
  });

  it('fetches the pools when the panel opens, and again on every later opening', async () => {
    const rendered = render();
    await settle();
    http.expectNone(POOLS);
    rendered.button.click();
    rendered.fixture.detectChanges();
    await settle();
    http.expectOne(LIST).flush(maintenanceGoldenMaster('pending bumps', 'listPendingBumps'));
    http.expectOne(POOLS).flush(RECORDED);
    await settle();
    await reopen(rendered);
    http.expectOne(POOLS).flush(RECORDED);
    // The bumps loaded: an opening reads them only after a failure.
    http.expectNone(LIST);
  });

  it('lists the recorded pool below the bumps, name and open/max', async () => {
    const { panel } = await opened(RECORDED);
    expect(poolRows(panel)).toEqual([['qits-artifacts', '1/256']]);
    const row = panel.querySelector('ui-spinner ~ ul > li')!;
    expect(row.getAttribute('data-qits-item')).toBe('origin=dev-qits-artifacts:8080');
    expect(row.parentElement!.getAttribute('data-qits-source')).toBe(
      'qits-edge-service#getUpstreamPools',
    );
  });

  it('lists both pools of one origin, in the order received, the stream pool named', async () => {
    const { panel } = await opened(BOTH_POOLS);
    expect(poolRows(panel)).toEqual([
      ['qits-artifacts', '1/256'],
      ['qits-artifacts · stream', '0/256'],
    ]);
  });

  it('renders nothing for the pools section on a non-2xx answer', async () => {
    const { panel } = await opened(null, { status: 500, statusText: 'Server Error' });
    expect(panel.querySelectorAll('ui-spinner ~ ul > li')).toHaveLength(0);
  });

  it('renders nothing for the pools section once a later read fails', async () => {
    const rendered = await opened(RECORDED);
    expect(poolRows(rendered.panel)).toHaveLength(1);
    await reopen(rendered);
    http.expectOne(POOLS).flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();
    rendered.fixture.detectChanges();
    expect(poolRows(rendered.panel)).toHaveLength(0);
  });

  it('renders nothing for the pools section on an empty answer', async () => {
    const { panel } = await opened([]);
    expect(panel.querySelectorAll('ui-spinner ~ ul > li')).toHaveLength(0);
  });
});
