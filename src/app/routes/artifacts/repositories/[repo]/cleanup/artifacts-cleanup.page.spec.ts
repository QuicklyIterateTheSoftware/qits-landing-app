import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QitsApiError, QitsOfflineError } from '@qits/angular';
import { client as orchestratorClient } from '../../../../../api/orchestrator/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { ARTIFACTS_CLEANUP_SWEEP } from '$core/artifacts/cleanup.operations';
import { orchestratorGoldenMaster } from '../../../../../../testing/golden-masters';
import { ArtifactsCleanupPage, explainRun } from './artifacts-cleanup.page';

/**
 * The cleanup page (qits-2329), its read answered with qits-orchestrator's recording of "a
 * repository the cleanup can plan" (`daemons`: one daemon version condemned, two kept, every blob
 * figure zeroed). The plans no recording holds are derived from it, each saying how: nothing to
 * delete, the live pins unread, a type with no collector, a type that failed closed, and figures a
 * grace window holds back. Its browser spec shoots the recorded plan; the golden-master guard there
 * admits no derived body.
 */
const PLANNABLE = 'a repository the cleanup can plan';
const REPO = 'daemons';
const PLAN = `/orchestrator/api/artifacts/repositories/${REPO}/plan`;
const SWEEP = `/orchestrator/api/artifacts/repositories/${REPO}/sweep`;

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

type Plan = any;

describe('ArtifactsCleanupPage', () => {
  let http: HttpTestingController;
  /** A fresh copy of the recorded plan, for a test to derive its answer from. */
  const recorded = (): Plan =>
    structuredClone(orchestratorGoldenMaster(PLANNABLE, 'planArtifactsCleanupRepository'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'artifacts/repositories/:repo/cleanup', component: ArtifactsCleanupPage },
          { path: 'artifacts/repositories/:repo', children: [] },
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

  /** The page with its plan answered by `body`. */
  async function render(body: Plan = recorded()) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/artifacts/repositories/${REPO}/cleanup`);
    await answered(harness);
    http.expectOne(PLAN).flush(body);
    await answered(harness);
    return { harness, element: harness.routeNativeElement as HTMLElement };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const buttons = (element: HTMLElement) =>
    [...element.querySelectorAll('button')].map((button) => text(button));
  const press = async (harness: RouterTestingHarness, label: string | RegExp) => {
    const element = harness.routeNativeElement as HTMLElement;
    const button = [...element.querySelectorAll('button')].find((b) =>
      typeof label === 'string' ? text(b) === label : label.test(text(b)),
    );
    if (!button) throw new Error(`no button ${label}: ${buttons(element).join(' | ')}`);
    button.click();
    await answered(harness);
  };

  it('draws Run for the recorded plan, which condemns one identity', async () => {
    const { element } = await render();
    expect(text(element.querySelector('[data-dead-figures]'))).toContain(
      '1 identity, freeing 0 B in 0 blob files',
    );
    expect(buttons(element)).toContain('Run: 1 identity · 0 B…');
    expect(element.querySelector('[data-nothing-to-run]')).toBeNull();
    expect(element.querySelector('[data-withheld]')).toBeNull();
    expect(element.querySelector('[data-structural]')).toBeNull();
  });

  it('draws no Run when the plan condemns nothing, and says there is nothing to run', async () => {
    // Derived: the recorded plan with no dead identity and its sweep figures at zero (they are).
    // The browser spec shoots the same case from its own recording ("a repository the cleanup has
    // nothing to delete in").
    const plan = recorded();
    plan.dead = [];
    plan.sweep = { ...plan.sweep, blobCount: 0, reclaimableBytes: 0 };
    const { element } = await render(plan);
    expect(text(element.querySelector('[data-nothing-dead]'))).toContain('Nothing.');
    expect(text(element.querySelector('[data-nothing-to-run]'))).toContain(
      'There is nothing to run',
    );
    expect(buttons(element).some((label) => label.startsWith('Run'))).toBe(false);
  });

  it('draws no Run when the live pins could not be read, and keeps the plan visible', async () => {
    // Derived: the recorded plan as a run whose qits-cd source did not answer.
    const plan = recorded();
    plan.executable = false;
    plan.pinFailures = ['qits-cd: connection refused'];
    plan.pins[0] = { ...plan.pins[0], answered: false };
    const { element } = await render(plan);
    expect(text(element.querySelector('[data-not-executable]'))).toContain(
      'This cleanup cannot be run now: the live pins could not be read (qits-cd: connection refused).',
    );
    expect(text(element.querySelector('[aria-label="Pin sources"]'))).toContain(
      'supplied: qits-platform-deployments · did not answer · 0 ms',
    );
    expect(text(element.querySelector('[aria-label="Would be deleted"]'))).toContain(
      'contract-daemon@2026.0.1',
    );
    expect(buttons(element).some((label) => label.startsWith('Run'))).toBe(false);
    expect(element.querySelector('[data-nothing-to-run]')).toBeNull();
  });

  it('says a type with no collector is not collected, with no figures and no Run', async () => {
    // Derived: the recorded plan as qits-artifacts answers a type nothing collects: no strategy,
    // its note, and no identity on either list.
    const plan = recorded();
    plan.strategy = null;
    plan.note = 'no collector for type sboms';
    plan.dead = [];
    plan.kept = [];
    const { element } = await render(plan);
    expect(text(element.querySelector('[data-not-collected]'))).toBe(
      'Not collected: nothing collects this repository’s type, so nothing of it is ever deleted. no collector for type sboms',
    );
    expect(element.querySelector('[aria-label="Would be deleted"]')).toBeNull();
    expect(element.querySelector('[data-nothing-dead]')).toBeNull();
    expect(element.querySelector('[data-nothing-to-run]')).toBeNull();
    expect(buttons(element).some((label) => label.startsWith('Run'))).toBe(false);
  });

  it('draws no Run when the type failed closed, and says no figure is a finding', async () => {
    // Derived: the recorded plan with the type's refusal in `error`.
    const plan = recorded();
    plan.error = 'the daemon index could not be read';
    const { element } = await render(plan);
    expect(text(element.querySelector('[data-plan-error]'))).toContain(
      'Nothing of this repository was planned: the daemon index could not be read.',
    );
    expect(buttons(element).some((label) => label.startsWith('Run'))).toBe(false);
  });

  it('says what the grace window holds back and what the rule condemns in total', async () => {
    // Derived: the recorded plan with figures, as `daemons` answered live on 2026-11-20 (in shape).
    const plan = recorded();
    plan.sweep = {
      ...plan.sweep,
      blobCount: 2,
      reclaimableBytes: 43_200_000,
      withheldByGraceWindow: 1,
      withheldBytes: 1024,
    };
    plan.structural = { ...plan.structural, blobCount: 3, reclaimableBytes: 43_201_024 };
    const { element } = await render(plan);
    expect(buttons(element)).toContain('Run: 1 identity · 41.2 MiB…');
    expect(text(element.querySelector('[data-withheld]'))).toBe(
      '1 blob (1.00 KiB) are younger than the PT6H grace window and this run leaves them alone. Not lost: a later run takes them, with the rows that name them.',
    );
    expect(text(element.querySelector('[data-structural]'))).toBe(
      'The rule condemns 3 blobs (41.2 MiB) in total, whatever the age of the files.',
    );
  });

  it('sends the sweep only on the second press, once, and shows the receipt in the plan’s place', async () => {
    const { harness, element } = await render();
    await press(harness, 'Run: 1 identity · 0 B…');
    http.expectNone(SWEEP);
    await press(harness, 'Delete 1 identity · 0 B');
    const sweep = http.expectOne(SWEEP);
    expect(sweep.request.method).toBe('POST');
    sweep.flush(orchestratorGoldenMaster(PLANNABLE, 'sweepArtifactsCleanupRepository'));
    await answered(harness);
    expect(element.querySelector('[data-receipt]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Would be deleted"]')).toBeNull();
    expect(text(element.querySelector('[data-receipt-figures]'))).toBe(
      '0 identities deleted, 0 blob files unlinked, 0 B reclaimed.',
    );
  });

  it('says an aborted run deleted nothing', async () => {
    const { harness, element } = await render();
    await press(harness, /^Run:/);
    await press(harness, /^Delete/);
    // Derived: the recorded receipt of a run whose pins did not answer at its start.
    const receipt = structuredClone(
      orchestratorGoldenMaster(PLANNABLE, 'sweepArtifactsCleanupRepository'),
    );
    receipt.aborted = 'qits-cd did not answer';
    http.expectOne(SWEEP).flush(receipt);
    await answered(harness);
    expect(text(element.querySelector('[data-aborted]'))).toContain(
      'The run was aborted and nothing was deleted: qits-cd did not answer.',
    );
  });

  it('asks again after a failed run, and sends nothing by itself', async () => {
    const { harness, element } = await render();
    await press(harness, /^Run:/);
    await press(harness, /^Delete/);
    http.expectOne(SWEEP).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await answered(harness);
    expect(text(element.querySelector('[data-run-error]'))).toContain('No receipt came back');
    expect(element.querySelector('[data-confirm]')).toBeNull();
    expect(buttons(element)).toContain('Run: 1 identity · 0 B…');
    http.expectNone(SWEEP);
  });

  describe('explainRun', () => {
    const refusal = (status: number, message?: string) =>
      new QitsApiError(status, message ? { message } : undefined, ARTIFACTS_CLEANUP_SWEEP);

    it('reads a 4xx as a refusal before anything ran, in the service’s words', () => {
      expect(explainRun(refusal(404, 'no such repository: x'))).toBe(
        'The cleanup did not run — 404 no such repository: x. Nothing was deleted.',
      );
      expect(explainRun(refusal(409))).toBe(
        'The cleanup did not run — a gc run is active. Nothing was deleted.',
      );
    });

    it('reads a 403 as not allowed, not as an error', () => {
      expect(explainRun(refusal(403))).toBe(
        'The cleanup did not run — you are not allowed to run it: only qits:admin, qits:admin-agent, qits:desk-admin, qits:system or qits:agent may. Nothing was deleted.',
      );
    });

    it('reads a 5xx or no answer as no receipt, and says to re-read the plan', () => {
      expect(explainRun(refusal(502, 'qits-artifacts could not be asked'))).toBe(
        'No receipt came back — 502 qits-artifacts could not be asked. This page cannot tell whether anything was deleted: re-read the plan before running it again.',
      );
      expect(explainRun(new TypeError('network'))).toContain(
        'No receipt came back — the service is unreachable.',
      );
    });

    it('reads an offline refusal as never sent', () => {
      expect(explainRun(new QitsOfflineError('offline'))).toBe(
        'The cleanup did not run — this browser is offline, and a cleanup is never queued. Nothing was deleted.',
      );
    });
  });
});
