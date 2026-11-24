import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const ORCHESTRATOR = 'qits-orchestrator';
const PROCESS = 'the gc process';
const FINISHED = 'a finished gc dry run';
const NEVER_RAN = 'the gc process before its first run';
const RUNNING = 'a running gc run';
const IDLE = 'no active gc run';

/** The run every recording names (`runId`), and the step "a finished gc dry run" records whole. */
const RUN_ID = '00000000-0000-4000-8000-000000000001';
const STEP_ID = 'artifacts.plan';

const PROCESSES = '/orchestrator/api/processes';
const RUNS = '/orchestrator/api/processes/gc/runs';
/** The run's read, always without bodies (the client writes the query into the URL). */
const RUN = (id = RUN_ID) => `/orchestrator/api/runs/${id}?bodies=false`;
const STEP = `/orchestrator/api/runs/${RUN_ID}/steps/${STEP_ID}`;
const PATH = '/orchestrator/processes/gc';
/** Longer than the 10 s the page once polled a running run at (qits-2472 replaced the poll). */
const PAST_A_POLL_MS = 30_000;

/**
 * Screenshots of the Orchestrator section's process page (qits-2359) inside the shell
 * (`openRoute`), with no project open, its reads answered with qits-orchestrator's recordings: the
 * process from "the gc process"; a finished dry run's list, run (without bodies) and its
 * `artifacts.plan` step whole from "a finished gc dry run" (`finished`, `step`); a running real run
 * from "a running gc run" (`running`, a fake clock showing it is never polled; its 409 is the refused
 * start, `refused`); no run from "the gc process before its first run" (`empty`); and a start's
 * 202 from "no active gc run". A read still open (`loading`) and a 503 on the runs
 * (`unavailable`) are statuses only, as are a 404 on the runs (an unknown kind) and on a `?run=`.
 *
 * The processes without a dry run (qits-2490) are shown the same way from their own recordings:
 * Manifest scan from "the scan process", "a finished scan run" (`scan`, its `internal.follow` step
 * whole) and "no active scan run" (Run now's real start); SBOM check from "the sbom-check process",
 * "a finished sbom-check run" (`sbom-check`, its `check` step whole) and "no active sbom-check run".
 * Neither offers Dry run, and neither says anything of gc's.
 *
 * Every test skips itself while the pinned `@qits/orchestrator-golden-masters` lacks the
 * recordings (they come with qits-orchestrator's release carrying qits-2359), as the reader then
 * refuses them.
 *
 * Its outcomes (epic qits-2000) are each reached: a run's Started and "Show the newest run"
 * (`open-orchestrator-run`), a step's card, opening and closing (`open-orchestrator-step`), Run
 * now's first press and Not now (`ask-orchestrator-run`), the confirmed Run now, started and
 * refused (`start-orchestrator-run`), and Dry run, started and refused
 * (`start-orchestrator-dry-run`). The shell's are shot once (`shootShellMenus`).
 */
describe('OrchestratorProcessPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async (context) => {
    // Every test reads the process; until the pin records it, none can run.
    const recorded = await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR).catch(
      () => undefined,
    );
    if (!recorded) context.skip();
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    vi.useRealTimers();
    http?.verify();
    await page.viewport(800, 600);
  });

  /** Opens the process page at `url`, its reads still open. */
  async function open(url = PATH): Promise<OpenedRoute> {
    await page.viewport(1280, 1000);
    return openRoute(url);
  }

  /** The open GET of `url`, if any. */
  const read = (url: string): TestRequest =>
    http.expectOne((request) => request.method === 'GET' && request.url === url);

  /** Answers the process and the runs, then the shown run, from `state`. */
  async function answer(opened: OpenedRoute, state: string) {
    read(PROCESSES).flush(await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR));
    read(RUNS).flush(await goldenMaster(state, 'listProcessRuns', ORCHESTRATOR));
    await opened.settled();
    read(RUN()).flush(await goldenMaster(state, 'getProcessRun', ORCHESTRATOR));
    await opened.settled();
  }

  /** The page, answered from `state`. */
  async function render(state: string, url = PATH) {
    const opened = await open(url);
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** A step's card. */
  const card = (opened: OpenedRoute, id: string) => {
    const element = opened.page.querySelector<HTMLElement>(`[data-step="${id}"]`);
    if (!element) throw new Error(`no card ${id}`);
    return page.elementLocator(element);
  };

  /**
   * Makes the viewport as tall as the whole page before a shot, so every viewport's shot holds all
   * of it (each is as tall as the viewport). Measured at the phone's width, where it is tallest:
   * there the document scrolls and the frame grows with the page; scrolling instead leaves the
   * phone's shot blank below its first screen.
   */
  async function fitWholePage(opened: OpenedRoute) {
    const width = window.innerWidth;
    await page.viewport(390, 844);
    await opened.settled();
    const height = opened.frame.scrollHeight;
    await page.viewport(width, Math.max(height, 900) + 40);
    await opened.settled();
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  const url = () => TestBed.inject(Router).url;

  it('shows a finished dry run: the runs, the run’s facts and its steps by dependency depth', async () => {
    const { opened, view } = await render(FINISHED);
    await expect
      .element(view.getByRole('heading', { name: 'Garbage collection', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('Reads the platform');
    const table = view.getByRole('table', { name: 'Runs' });
    await expect.element(table).toMatchTextContent('1 run, newest first');
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Status\s*Started\s*Took\s*Trigger\s*Summary/);
    expect(rows[1].textContent).toMatch(/SUCCEEDED\s*1 Jan 2026 00:00:00Z\s*0s\s*manual\s*dry run/);
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    const facts = view
      .getByRole('definition')
      .elements()
      .map((dd) => dd.textContent?.trim());
    expect(facts).toContain(RUN_ID);
    expect(facts).toContain('Yes: nothing is deleted');
    // The board: one column per dependency depth, the service's order within each.
    const columns = [...opened.page.querySelectorAll('[data-column]')];
    expect(columns.length).toBeGreaterThan(2);
    expect(columns[0].querySelector('[data-step]')?.getAttribute('data-step')).toBe('usage.before');
    await expect.element(card(opened, 'artifacts.sweep')).toMatchTextContent('SKIPPED');
    await expect.element(card(opened, 'artifacts.sweep')).toMatchTextContent('dry run');
    await expect.element(card(opened, STEP_ID)).toMatchTextContent('POST /artifacts/api/gc/plan');
    // The root sidebar's Orchestrator is the open section, its Garbage collection the current page
    // (qits-2480).
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Orchestrator', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Garbage collection', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('finished', { kind: 'DATA' });
    await shootShellMenus(opened, 'finished');
  });

  it('open-orchestrator-step opened, closed: a card opens its call, a second press closes it', async () => {
    const { opened, view } = await render(FINISHED);
    await card(opened, STEP_ID).click();
    await opened.settled();
    expect(url()).toBe(`${PATH}?step=${STEP_ID}`);
    read(STEP).flush(await goldenMaster(FINISHED, 'getProcessRunStep', ORCHESTRATOR));
    await opened.settled();
    const detail = view.getByRole('region', { name: /Plan the registry collection/ });
    await expect
      .element(detail)
      .toMatchTextContent('POST http://dev-qits-artifacts:8080/artifacts/api/gc/plan');
    await expect.element(detail).toMatchTextContent('"dryRun": true');
    await expect.element(detail).toMatchTextContent('pins.deployments, pins.ci, pins.dependencies');
    // The response stays collapsed until asked for, its size on the toggle.
    expect(opened.page.textContent).not.toContain('"executable"');
    await detail.getByRole('button', { name: 'Show 31 B' }).click();
    await opened.settled();
    await expect.element(detail).toMatchTextContent('"executable": true');
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('step', { kind: 'DATA' });
    await card(opened, STEP_ID).click();
    await opened.settled();
    expect(url()).toBe(PATH);
    expect(reached()).toEqual(['open-orchestrator-step:opened', 'open-orchestrator-step:closed']);
    expect(
      view.getByRole('region', { name: /Plan the registry collection/ }).elements(),
    ).toHaveLength(0);
  });

  it('opens the run and the step a deep link names', async () => {
    const { opened, view } = await render(FINISHED, `${PATH}?run=${RUN_ID}&step=${STEP_ID}`);
    read(STEP).flush(await goldenMaster(FINISHED, 'getProcessRunStep', ORCHESTRATOR));
    await opened.settled();
    await expect
      .element(view.getByRole('region', { name: /Plan the registry collection/ }))
      .toMatchTextContent('Request body');
    await expect.element(card(opened, STEP_ID)).toHaveAttribute('aria-pressed', 'true');
  });

  it('open-orchestrator-run opened: a run’s Started shows it, the URL replaced', async () => {
    const { opened, view } = await render(FINISHED);
    await view.getByRole('link', { name: '1 Jan 2026 00:00:00Z' }).click();
    await opened.settled();
    expect(url()).toBe(`${PATH}?run=${RUN_ID}`);
    expect(reached()).toEqual(['open-orchestrator-run:opened']);
    // The run shown already: nothing to read again.
    http.expectNone(RUN());
  });

  it('shows a running run, reads it again only on Refresh, and keeps it through a failed read', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { opened, view } = await render(RUNNING);
    const [, row] = view.getByRole('table', { name: 'Runs' }).getByRole('row').elements();
    expect(row.textContent).toMatch(/RUNNING\s*1 Jan 2026 00:00:00Z\s*—\s*manual/);
    await expect.element(card(opened, 'pins.ci')).toMatchTextContent('RUNNING');
    await expect.element(card(opened, 'pins.dependencies')).toMatchTextContent('PENDING');
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('running', { kind: 'DATA' });
    // No poll: a running run is read again on its events (qits-2472), never on a clock.
    vi.advanceTimersByTime(PAST_A_POLL_MS);
    await opened.settled();
    http.expectNone(RUN());
    // A failed read again keeps the run on screen and says so.
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.settled();
    read(PROCESSES).flush(await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR));
    read(RUNS).flush(await goldenMaster(RUNNING, 'listProcessRuns', ORCHESTRATOR));
    read(RUN()).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('The last update did not arrive');
    await expect.element(card(opened, 'pins.ci')).toMatchTextContent('RUNNING');
    // The next read that arrives takes the note away.
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.settled();
    read(PROCESSES).flush(await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR));
    read(RUNS).flush(await goldenMaster(FINISHED, 'listProcessRuns', ORCHESTRATOR));
    read(RUN()).flush(await goldenMaster(FINISHED, 'getProcessRun', ORCHESTRATOR));
    await opened.settled();
    expect(view.getByRole('status').elements()).toHaveLength(0);
  });

  it('says a process that never ran has no runs', async (context) => {
    const recorded = await goldenMaster(NEVER_RAN, 'listProcessRuns', ORCHESTRATOR).catch(
      () => undefined,
    );
    if (!recorded) context.skip();
    const opened = await open();
    read(PROCESSES).flush(await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR));
    read(RUNS).flush(await goldenMaster(NEVER_RAN, 'listProcessRuns', ORCHESTRATOR));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent(
        'This process has never run here. Run now starts it. Dry run goes through it without changing anything.',
      );
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the runs cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read(PROCESSES).flush(await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR));
    read(RUNS).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The runs could not be read.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.settled();
    read(RUNS).flush(await goldenMaster(FINISHED, 'listProcessRuns', ORCHESTRATOR));
    await opened.settled();
    read(RUN()).flush(await goldenMaster(FINISHED, 'getProcessRun', ORCHESTRATOR));
    await opened.settled();
    await expect.element(view.getByRole('table', { name: 'Runs' })).toMatchTextContent('1 run');
  });

  it('says there is no such process when the runs’ read is a 404', async () => {
    const opened = await open('/orchestrator/processes/nope');
    read(PROCESSES).flush(await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR));
    read('/orchestrator/api/processes/nope/runs').flush(null, {
      status: 404,
      statusText: 'Not Found',
    });
    await opened.settled();
    await expect
      .element(page.elementLocator(opened.page).getByRole('alert'))
      .toMatchTextContent('There is no process called “nope”.');
  });

  it('open-orchestrator-run opened: a run the service does not know leads to the newest', async () => {
    const unknown = '00000000-0000-4000-8000-000000000009';
    const opened = await open(`${PATH}?run=${unknown}`);
    read(PROCESSES).flush(await goldenMaster(PROCESS, 'listProcesses', ORCHESTRATOR));
    read(RUNS).flush(await goldenMaster(FINISHED, 'listProcessRuns', ORCHESTRATOR));
    read(RUN(unknown)).flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(`There is no run ${unknown} of this process.`);
    await view.getByRole('link', { name: 'Show the newest run' }).click();
    await opened.settled();
    expect(url()).toBe(PATH);
    expect(reached()).toEqual(['open-orchestrator-run:opened']);
    read(RUN()).flush(await goldenMaster(FINISHED, 'getProcessRun', ORCHESTRATOR));
    await opened.settled();
  });

  it('start-orchestrator-dry-run started: Dry run starts one at once and shows it', async () => {
    const { opened, view } = await render(FINISHED);
    await view.getByRole('button', { name: 'Dry run', exact: true }).click();
    await opened.settled();
    const start = http.expectOne((request) => request.method === 'POST' && request.url === RUNS);
    expect(start.request.body).toEqual({ dryRun: true });
    start.flush(await goldenMaster(IDLE, 'startProcessRun', ORCHESTRATOR), {
      status: 202,
      statusText: 'Accepted',
    });
    await opened.settled();
    expect(url()).toBe(`${PATH}?run=${RUN_ID}`);
    expect(reached()).toEqual(['start-orchestrator-dry-run:started']);
    read(RUNS).flush(await goldenMaster(FINISHED, 'listProcessRuns', ORCHESTRATOR));
    await opened.settled();
  });

  it('start-orchestrator-dry-run refused: a run already active is said in the service’s words', async () => {
    const { opened, view } = await render(RUNNING);
    await view.getByRole('button', { name: 'Dry run', exact: true }).click();
    await opened.settled();
    http
      .expectOne((request) => request.method === 'POST' && request.url === RUNS)
      .flush(await goldenMaster(RUNNING, 'startProcessRun', ORCHESTRATOR), {
        status: 409,
        statusText: 'Conflict',
      });
    await opened.settled();
    expect(reached()).toEqual(['start-orchestrator-dry-run:refused']);
    await expect
      .element(page.elementLocator(opened.page.querySelector('[data-start-note]')!))
      .toMatchTextContent(`Not started: a gc run is already active: ${RUN_ID}.`);
    read(RUNS).flush(await goldenMaster(RUNNING, 'listProcessRuns', ORCHESTRATOR));
    await opened.settled();
  });

  it('ask-orchestrator-run asked, withdrawn: Run now asks first, Not now takes it back', async () => {
    const { opened, view } = await render(FINISHED);
    await view.getByRole('button', { name: 'Run now', exact: true }).click();
    await opened.settled();
    await expect
      .element(page.elementLocator(opened.page.querySelector('[data-confirm]')!))
      .toMatchTextContent('Run garbage collection now? This is the real run, not a dry run.');
    http.expectNone(RUNS);
    await view.getByRole('button', { name: 'Not now' }).click();
    await opened.settled();
    expect(reached()).toEqual(['ask-orchestrator-run:asked', 'ask-orchestrator-run:withdrawn']);
    expect(opened.page.querySelector('[data-confirm]')).toBeNull();
    http.expectNone(RUNS);
  });

  it('start-orchestrator-run started: the confirmed Run now starts a real run and shows it', async () => {
    const { opened, view } = await render(FINISHED);
    await view.getByRole('button', { name: 'Run now', exact: true }).click();
    await opened.settled();
    await userEvent.click(view.getByRole('button', { name: 'Confirm: run now' }));
    await opened.settled();
    const start = http.expectOne((request) => request.method === 'POST' && request.url === RUNS);
    expect(start.request.body).toEqual({ dryRun: false });
    // The recorded 202 (a dry run's: no recording holds a real start, whose answer is the same).
    start.flush(await goldenMaster(IDLE, 'startProcessRun', ORCHESTRATOR), {
      status: 202,
      statusText: 'Accepted',
    });
    await opened.settled();
    expect(reached()).toEqual(['ask-orchestrator-run:asked', 'start-orchestrator-run:started']);
    expect(url()).toBe(`${PATH}?run=${RUN_ID}`);
    read(RUNS).flush(await goldenMaster(FINISHED, 'listProcessRuns', ORCHESTRATOR));
    await opened.settled();
  });

  it('start-orchestrator-run refused: Run now while a run is active is refused, and said', async () => {
    const { opened, view } = await render(RUNNING);
    await view.getByRole('button', { name: 'Run now', exact: true }).click();
    await opened.settled();
    await view.getByRole('button', { name: 'Confirm: run now' }).click();
    await opened.settled();
    http
      .expectOne((request) => request.method === 'POST' && request.url === RUNS)
      .flush(await goldenMaster(RUNNING, 'startProcessRun', ORCHESTRATOR), {
        status: 409,
        statusText: 'Conflict',
      });
    await opened.settled();
    read(RUNS).flush(await goldenMaster(RUNNING, 'listProcessRuns', ORCHESTRATOR));
    await opened.settled();
    expect(reached()).toEqual(['ask-orchestrator-run:asked', 'start-orchestrator-run:refused']);
    await expect
      .element(page.elementLocator(opened.page.querySelector('[data-start-note]')!))
      .toMatchTextContent(`Not started: a gc run is already active: ${RUN_ID}.`);
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  /**
   * The processes without a dry run (qits-2490): each kind's page from its own recordings, its
   * sidebar entry current, no Dry run, Run now asking in its own words and starting a real run.
   */
  const UNDRY = [
    {
      kind: 'scan',
      name: 'Manifest scan',
      lede: 'Asks qits-maintenance to re-scan',
      process: 'the scan process',
      finished: 'a finished scan run',
      idle: 'no active scan run',
      step: 'internal.follow',
      stepName: /Follow the internal scan/,
      question: 'Run manifest scan now? It has no dry run: it does the real work at once.',
    },
    {
      kind: 'sbom-check',
      name: 'SBOM check',
      lede: 'Asks qits-maintenance to check every released version',
      process: 'the sbom-check process',
      finished: 'a finished sbom-check run',
      idle: 'no active sbom-check run',
      step: 'check',
      stepName: /Check the SBOMs/,
      question: 'Run SBOM check now? It has no dry run: it does the real work at once.',
    },
  ] as const;

  for (const shown of UNDRY) {
    const path = `/orchestrator/processes/${shown.kind}`;
    const runs = `/orchestrator/api/processes/${shown.kind}/runs`;

    /** The kind's page, its process, runs and newest run answered from its own recordings. */
    async function renderKind(url = path) {
      const opened = await open(url);
      read(PROCESSES).flush(await goldenMaster(shown.process, 'listProcesses', ORCHESTRATOR));
      read(runs).flush(await goldenMaster(shown.finished, 'listProcessRuns', ORCHESTRATOR));
      await opened.settled();
      read(RUN()).flush(await goldenMaster(shown.finished, 'getProcessRun', ORCHESTRATOR));
      await opened.settled();
      return { opened, view: page.elementLocator(opened.page) };
    }

    it(`shows ${shown.name}: its own name and lede, its run, no Dry run`, async (context) => {
      const recorded = await goldenMaster(shown.process, 'listProcesses', ORCHESTRATOR).catch(
        () => undefined,
      );
      if (!recorded) context.skip();
      const { opened, view } = await renderKind();
      await expect
        .element(view.getByRole('heading', { name: shown.name, exact: true }))
        .toBeVisible();
      await expect.element(view).toMatchTextContent(shown.lede);
      expect(opened.page.textContent).not.toContain('Garbage collection');
      expect(opened.page.textContent).not.toContain('delet');
      const [, row] = view.getByRole('table', { name: 'Runs' }).getByRole('row').elements();
      expect(row.textContent).toMatch(/SUCCEEDED\s*1 Jan 2026 00:00:00Z\s*0s\s*scheduled/);
      expect(row.textContent).not.toContain('dry run');
      await expect.element(card(opened, shown.step)).toMatchTextContent('SUCCEEDED');
      expect(view.getByRole('button', { name: 'Dry run', exact: true }).elements()).toHaveLength(0);
      await expect
        .element(view.getByRole('button', { name: 'Run now', exact: true }))
        .toBeVisible();
      const navigation = page
        .elementLocator(opened.frame)
        .getByRole('navigation', { name: 'qits' });
      await expect
        .element(navigation.getByRole('link', { name: shown.name, exact: true }))
        .toHaveAttribute('aria-current', 'page');
      await fitWholePage(opened);
      await expect
        .element(page.elementLocator(opened.frame))
        .toMatchScreenshot(shown.kind, { kind: 'DATA' });
    });

    it(`open-orchestrator-step opened: a ${shown.name} step’s call`, async (context) => {
      const recorded = await goldenMaster(shown.process, 'listProcesses', ORCHESTRATOR).catch(
        () => undefined,
      );
      if (!recorded) context.skip();
      const { opened, view } = await renderKind();
      await card(opened, shown.step).click();
      await opened.settled();
      expect(url()).toBe(`${path}?step=${shown.step}`);
      read(`/orchestrator/api/runs/${RUN_ID}/steps/${shown.step}`).flush(
        await goldenMaster(shown.finished, 'getProcessRunStep', ORCHESTRATOR),
      );
      await opened.settled();
      const detail = view.getByRole('region', { name: shown.stepName });
      await expect.element(detail).toMatchTextContent('http://dev-qits-maintenance:8080');
      await detail.getByRole('button', { name: /^Show / }).click();
      await opened.settled();
      await fitWholePage(opened);
      await expect
        .element(page.elementLocator(opened.frame))
        .toMatchScreenshot(`${shown.kind}-step`, { kind: 'DATA' });
      expect(reached()).toEqual(['open-orchestrator-step:opened']);
    });

    it(`start-orchestrator-run started: ${shown.name}’s Run now asks in its words, then starts a real run`, async (context) => {
      const recorded = await goldenMaster(shown.process, 'listProcesses', ORCHESTRATOR).catch(
        () => undefined,
      );
      if (!recorded) context.skip();
      const { opened, view } = await renderKind();
      await view.getByRole('button', { name: 'Run now', exact: true }).click();
      await opened.settled();
      await expect
        .element(page.elementLocator(opened.page.querySelector('[data-confirm]')!))
        .toMatchTextContent(shown.question);
      await userEvent.click(view.getByRole('button', { name: 'Confirm: run now' }));
      await opened.settled();
      const start = http.expectOne((request) => request.method === 'POST' && request.url === runs);
      expect(start.request.body).toEqual({ dryRun: false });
      start.flush(await goldenMaster(shown.idle, 'startProcessRun', ORCHESTRATOR), {
        status: 202,
        statusText: 'Accepted',
      });
      await opened.settled();
      expect(reached()).toEqual(['ask-orchestrator-run:asked', 'start-orchestrator-run:started']);
      expect(url()).toBe(`${path}?run=${RUN_ID}`);
      read(runs).flush(await goldenMaster(shown.finished, 'listProcessRuns', ORCHESTRATOR));
      await opened.settled();
    });
  }
});
