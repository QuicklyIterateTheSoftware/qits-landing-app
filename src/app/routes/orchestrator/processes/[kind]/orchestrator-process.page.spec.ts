import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as orchestratorClient } from '../../../../api/orchestrator/client.gen';
import { provideHeyApiClient } from '../../../../api/orchestrator/client/client.gen';
import {
  isRecorded,
  orchestratorGoldenMaster,
  orchestratorGoldenMasters,
} from '../../../../../testing/golden-masters';
import { OrchestratorProcessPage } from './orchestrator-process.page';

/**
 * The process page (qits-2359), its reads answered with qits-orchestrator's recordings: "the gc
 * process", "a finished gc dry run" (one dry run, 21 steps) and "no active gc run" (a start's 202).
 * What the browser spec cannot show is here: the request Run now sends (no recording holds a real
 * start, so the pact binds the dry run's), and that the run is always read without bodies. The
 * whole spec skips itself while the pinned `@qits/orchestrator-golden-masters` lacks the
 * recordings (they come with qits-orchestrator's release carrying qits-2359).
 */
const PROCESS = 'the gc process';
const FINISHED = 'a finished gc dry run';
const IDLE = 'no active gc run';
const RUN_ID = '00000000-0000-4000-8000-000000000001';
const PROCESSES = '/orchestrator/api/processes';
const RUNS = '/orchestrator/api/processes/gc/runs';
/** The shown run's read, without bodies. */
const RUN = `/orchestrator/api/runs/${RUN_ID}?bodies=false`;

const RECORDED =
  isRecorded(PROCESS, 'listProcesses', orchestratorGoldenMasters) &&
  isRecorded(FINISHED, 'getProcessRun', orchestratorGoldenMasters) &&
  isRecorded(IDLE, 'startProcessRun', orchestratorGoldenMasters);

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe.skipIf(!RECORDED)('OrchestratorProcessPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'orchestrator/processes/:kind', component: OrchestratorProcessPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(orchestratorClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** The page with the process, the runs and the newest run answered from "a finished gc dry run". */
  async function render() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/orchestrator/processes/gc');
    await answered(harness);
    http.expectOne(PROCESSES).flush(orchestratorGoldenMaster(PROCESS, 'listProcesses'));
    http.expectOne(RUNS).flush(orchestratorGoldenMaster(FINISHED, 'listProcessRuns'));
    await answered(harness);
    http.expectOne(RUN).flush(orchestratorGoldenMaster(FINISHED, 'getProcessRun'));
    await answered(harness);
    return { harness, element: harness.routeNativeElement as HTMLElement };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const press = async (harness: RouterTestingHarness, label: string) => {
    const element = harness.routeNativeElement as HTMLElement;
    const button = [...element.querySelectorAll('button')].find((b) => text(b) === label);
    if (!button) throw new Error(`no button ${label}`);
    button.click();
    await answered(harness);
  };

  it('reads the shown run without any step’s bodies', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/orchestrator/processes/gc');
    await answered(harness);
    http.expectOne(PROCESSES).flush(orchestratorGoldenMaster(PROCESS, 'listProcesses'));
    // No `limit`: the door's default, the latest 20.
    http.expectOne(RUNS).flush(orchestratorGoldenMaster(FINISHED, 'listProcessRuns'));
    await answered(harness);
    // The client writes the query into the URL: the run is read with `bodies=false`, always.
    http.expectOne(RUN).flush(orchestratorGoldenMaster(FINISHED, 'getProcessRun'));
    await answered(harness);
  });

  it('Run now asks first and sends a real run only on the second press', async () => {
    const { harness, element } = await render();
    await press(harness, 'Run now');
    // Asked, nothing sent.
    http.expectNone(RUNS);
    expect(text(element.querySelector('[data-confirm] [role="alert"]'))).toBe(
      'Run garbage collection now? It deletes what the plan names.',
    );
    await press(harness, 'Confirm: run now');
    const start = http.expectOne((request) => request.url === RUNS && request.method === 'POST');
    expect(start.request.body).toEqual({ dryRun: false });
    // Derived: the recorded start's 202 (made by a dry run; a real start answers the same shape).
    start.flush(orchestratorGoldenMaster(IDLE, 'startProcessRun'), {
      status: 202,
      statusText: 'Accepted',
    });
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(`/orchestrator/processes/gc?run=${RUN_ID}`);
    // The list is read again, so the new run is in it.
    http
      .expectOne((request) => request.url === RUNS && request.method === 'GET')
      .flush(orchestratorGoldenMaster(FINISHED, 'listProcessRuns'));
    await answered(harness);
    expect(element.querySelector('[data-confirm]')).toBeNull();
  });

  it('Not now takes the question back without sending anything', async () => {
    const { harness, element } = await render();
    await press(harness, 'Run now');
    await press(harness, 'Not now');
    http.expectNone(RUNS);
    expect(element.querySelector('[data-confirm]')).toBeNull();
  });

  it('Dry run sends a dry run at once', async () => {
    const { harness } = await render();
    await press(harness, 'Dry run');
    const start = http.expectOne((request) => request.url === RUNS && request.method === 'POST');
    expect(start.request.body).toEqual({ dryRun: true });
    start.flush(orchestratorGoldenMaster(IDLE, 'startProcessRun'), {
      status: 202,
      statusText: 'Accepted',
    });
    await answered(harness);
    http
      .expectOne((request) => request.url === RUNS && request.method === 'GET')
      .flush(orchestratorGoldenMaster(FINISHED, 'listProcessRuns'));
    await answered(harness);
  });

  it('says a failed start is not known to have run, and offers Refresh', async () => {
    const { harness, element } = await render();
    await press(harness, 'Dry run');
    http
      .expectOne((request) => request.url === RUNS && request.method === 'POST')
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    await answered(harness);
    expect(text(element.querySelector('[data-start-note]'))).toBe(
      'No answer came back (502), so whether a run started is not known. Refresh shows the runs as they are now.',
    );
    http
      .expectOne((request) => request.url === RUNS && request.method === 'GET')
      .flush(orchestratorGoldenMaster(FINISHED, 'listProcessRuns'));
    await answered(harness);
  });

  it('says a start needs an admin role on a 403', async () => {
    const { harness, element } = await render();
    await press(harness, 'Dry run');
    http
      .expectOne((request) => request.url === RUNS && request.method === 'POST')
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await answered(harness);
    expect(text(element.querySelector('[data-start-note]'))).toBe(
      'Starting a run needs an admin role.',
    );
    http
      .expectOne((request) => request.url === RUNS && request.method === 'GET')
      .flush(orchestratorGoldenMaster(FINISHED, 'listProcessRuns'));
    await answered(harness);
  });
});
