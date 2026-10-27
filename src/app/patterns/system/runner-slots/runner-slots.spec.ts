import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { client as systemClient } from '../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../api/system/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import type { TargetEntry } from '$core/system/targets.consumes';
import { TargetsStore } from '$core/system/targets.store';
import { systemGoldenMaster } from '../../../../testing/golden-masters';
import { RunnerSlots } from './runner-slots';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('RunnerSlots', () => {
  const LIST = '/system/api/targets';
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const recorded = systemGoldenMaster<TargetEntry[]>('a declared target', 'listTargets');

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: DomainEvents, useValue: { on: () => events.asObservable() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The line with the store loading; `answer` settles the read. */
  async function render(answer: (request: ReturnType<HttpTestingController['expectOne']>) => void) {
    const fixture = TestBed.createComponent(RunnerSlots);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const loading = TestBed.inject(TargetsStore).load();
    await settle();
    fixture.detectChanges();
    expect(element.textContent?.trim()).toBe(''); // hidden while loading
    answer(http.expectOne(LIST));
    await loading;
    fixture.detectChanges();
    return { fixture, element };
  }

  /** The grid's rows, each `label value`. */
  const rows = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('dt')).map(
      (dt) => `${dt.textContent?.trim()} ${dt.nextElementSibling?.textContent?.trim()}`,
    );

  it('shows runners and slots at the left, and the use per type and the shared pool at the right', async () => {
    // The recorded target, connected and busy, plus a second one with a new slot type. The answer
    // names the reservations `minimums`, as qits-system still does.
    const [lab] = recorded;
    const { element } = await render((request) =>
      request.flush([
        { ...lab, connected: true, slotsTotal: 8, used: { ci: 4, workspace: 5, desk: 0 } },
        {
          ...lab,
          connected: true,
          slotsTotal: 8,
          used: { ci: 0, workspace: 1, desk: 0, gpu: 1 },
          minimums: { ci: 6, workspace: 0, desk: 1, gpu: 1 },
        },
      ]),
    );
    const line = element.querySelector('[data-testid="runner-slots"]')!;
    expect(line.classList).toContain('justify-between');
    const left = Array.from(line.firstElementChild!.children).map((s) => s.textContent?.trim());
    expect(left).toEqual(['runners: 2', 'slots: 11/16']);
    // Each type: its use, uncapped, of its reservation. Shared, per target: the first has 3 slots
    // nothing reserves and ci and workspaces use 2 + 3 beyond theirs; the second has none, and
    // workspaces uses 1 beyond its 0.
    expect(line.textContent).toContain('used / reserved');
    expect(rows(element)).toEqual([
      'ci: 4/8',
      'workspaces: 6/2',
      'desk: 0/2',
      'gpu: 1/1',
      'shared: 6/3',
    ]);
  });

  it('shows zeros for the recorded target, which is not connected', async () => {
    const { element } = await render((request) => request.flush(recorded));
    expect(element.textContent).toContain('runners: 0');
    expect(element.textContent).toContain('slots: 0/0');
    expect(rows(element)).toEqual(['ci: 0/0', 'workspaces: 0/0', 'desk: 0/0', 'shared: 0/0']);
  });

  it('stays hidden when the read is refused', async () => {
    const { element } = await render((request) =>
      request.flush(null, { status: 403, statusText: 'Forbidden' }),
    );
    expect(element.querySelector('[data-testid="runner-slots"]')).toBeNull();
    expect(element.textContent?.trim()).toBe('');
  });

  it('reads the targets again after a lease changes', async () => {
    await render((request) => request.flush(recorded));
    vi.useFakeTimers();
    events.next({ id: '1', name: 'TargetLeaseChanged', payload: '{}' });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
    http.expectOne(LIST).flush(recorded);
    await settle();
  });
});
