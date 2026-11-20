import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

const PLANNABLE = 'a repository the cleanup can plan';
const NOTHING_TO_DELETE = 'a repository the cleanup has nothing to delete in';
const ORCHESTRATOR = 'qits-orchestrator';
const ARTIFACTS = 'qits-artifacts';
const STORE = 'a store holding one artifact of every kind';

/** The repository the state records its plan and sweep for (`repository`). */
const REPO = 'daemons';
const PLAN = `/orchestrator/api/artifacts/repositories/${REPO}/plan`;
const SWEEP = `/orchestrator/api/artifacts/repositories/${REPO}/sweep`;

/**
 * Screenshots of the Artifacts section's cleanup page (qits-2329) inside the shell (`openRoute`),
 * with no project open, its one read (`planArtifactsCleanupRepository`) and its sweep
 * (`sweepArtifactsCleanupRepository`) answered with qits-orchestrator's recordings of "a repository
 * the cleanup can plan" (`daemons`: one daemon version condemned, two kept, the figures zeroed;
 * the sweep withholds the condemned version whole, so nothing is deleted): the plan (`plan`), the
 * kept list open (`kept`), the second press asked (`confirm`) and the receipt in the plan's place
 * (`receipt`); and "a repository the cleanup has nothing to delete in" (the same repository with
 * only its two kept versions: no Run; `nothing-to-delete`). A 404 (`unknown-repository`), a 403 (`refused`), a read still open (`loading`), a
 * failed read (`error`), a refused sweep (`run-refused`, 409) and a sweep with no receipt
 * (`run-lost`, 502) are statuses only (an error answer may carry the service's `message`).
 *
 * The plan as no recording holds it (the live pins unread, a type with no collector) is the plain spec's (`artifacts-cleanup.page.spec.ts`), which derives each answer
 * from the recording and says how: the golden-master guard admits no derived body here.
 *
 * Its outcomes (epic qits-2000) are each reached once: the back link (`leave-artifacts-cleanup`),
 * Re-read the plan (`reread-artifacts-cleanup-plan`), Run's first press and Keep everything
 * (`ask-artifacts-cleanup-run`), the second press, swept or refused
 * (`sweep-artifacts-repository`), and the kept list's toggle (`toggle-artifacts-cleanup-kept`).
 */
describe('ArtifactsCleanupPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Opens the repository's cleanup page, its read still open. */
  async function open(repo = REPO): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute(`/artifacts/repositories/${repo}/cleanup`);
  }

  /** Answers the plan's read with the recording. */
  async function answerPlan(opened: OpenedRoute) {
    http
      .expectOne(PLAN)
      .flush(await goldenMaster(PLANNABLE, 'planArtifactsCleanupRepository', ORCHESTRATOR));
    await opened.settled();
  }

  /** The page, its plan answered. */
  async function render() {
    const opened = await open();
    await answerPlan(opened);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Presses Run once, then Delete, leaving the sweep open. */
  async function pressTwice(opened: OpenedRoute) {
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'Run: 1 identity · 0 B…' }).click();
    await opened.settled();
    await view.getByRole('button', { name: 'Delete 1 identity · 0 B' }).click();
    await opened.idle();
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('shows what a cleanup would delete and keep, each with its rule, and how it read the pins', async () => {
    const { opened, view } = await render();
    await expect
      .element(view.getByRole('heading', { name: `Cleanup — ${REPO}`, exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('daemon-binaries');
    await expect.element(view).toMatchTextContent('Plan as of 1 Jan 2026 00:00:00Z');
    await expect.element(view).toMatchTextContent('own: always keep the last 2 released versions');
    const dead = view.getByRole('list', { name: 'Would be deleted' });
    await expect
      .element(dead)
      .toMatchTextContent(
        'contract-daemon@2026.0.1 — superseded and unaccessed for longer than P0D',
      );
    await expect
      .element(view)
      .toMatchTextContent('1 identity, freeing 0 B in 0 blob files — bytes nothing else');
    // The kept list is collapsed until asked for.
    expect(view.getByRole('list', { name: 'Would be kept' }).elements()).toHaveLength(0);
    const pins = view.getByRole('list', { name: 'Pin sources' });
    await expect
      .element(pins)
      .toMatchTextContent('supplied: qits-platform-deployments · 0 pins · 0 ms');
    expect(pins.getByRole('listitem').elements()).toHaveLength(5);
    await expect
      .element(view.getByRole('button', { name: 'Run: 1 identity · 0 B…' }))
      .toBeVisible();
    // The plan's row-less pool is not this repository's, and is not drawn (qits-2329).
    expect(opened.page.textContent).not.toContain('outside this mechanism');
    // The root sidebar's Artifacts stays current below the section.
    await expect
      .element(
        page
          .elementLocator(opened.frame)
          .getByRole('navigation', { name: 'qits' })
          .getByRole('link', { name: 'Artifacts' }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('plan', { kind: 'DATA' });
    await shootShellMenus(opened, 'plan');
  });

  it('says there is nothing to delete, and draws no Run, when the plan condemns nothing', async () => {
    const opened = await open();
    http
      .expectOne(PLAN)
      .flush(await goldenMaster(NOTHING_TO_DELETE, 'planArtifactsCleanupRepository', ORCHESTRATOR));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent(
        'Nothing. Every identity in this repository is kept by a rule, and the rules are listed below.',
      );
    await expect.element(view).toMatchTextContent('There is nothing to run');
    expect(view.getByRole('list', { name: 'Would be deleted' }).elements()).toHaveLength(0);
    expect(view.getByRole('button', { name: /^Run:/ }).elements()).toHaveLength(0);
    await expect
      .element(view.getByRole('button', { name: /kept identities/ }))
      .toMatchTextContent('Show the 2 kept identities');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('nothing-to-delete', { kind: 'NO_DATA' });
  });

  it('toggle-artifacts-cleanup-kept toggled: shows the kept identities, each with its rule', async () => {
    const { opened, view } = await render();
    const toggle = view.getByRole('button', {
      name: 'Show the 2 kept identities, each with the rule that saved it',
    });
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await opened.settled();
    expect(reached()).toEqual(['toggle-artifacts-cleanup-kept:toggled']);
    const kept = view.getByRole('list', { name: 'Would be kept' });
    expect(kept.getByRole('listitem').elements()).toHaveLength(2);
    await expect
      .element(kept)
      .toMatchTextContent(
        'contract-daemon@2026.2.0 — among the last 2 released versions of this identity group',
      );
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('kept', { kind: 'DATA' });
  });

  it('ask-artifacts-cleanup-run asked, kept: the first press asks, Keep everything takes it back', async () => {
    const { opened, view } = await render();
    await view.getByRole('button', { name: 'Run: 1 identity · 0 B…' }).click();
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(`Run this cleanup on ${REPO}? It deletes 1 identity listed above`);
    await expect
      .element(view.getByRole('button', { name: 'Delete 1 identity · 0 B' }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('confirm', { kind: 'DATA' });
    await view.getByRole('button', { name: 'Keep everything' }).click();
    await opened.settled();
    expect(reached()).toEqual([
      'ask-artifacts-cleanup-run:asked',
      'ask-artifacts-cleanup-run:kept',
    ]);
    // Asking and taking it back sent nothing.
    http.expectNone(SWEEP);
    await expect
      .element(view.getByRole('button', { name: 'Run: 1 identity · 0 B…' }))
      .toBeVisible();
  });

  it('sweep-artifacts-repository swept: the second press sweeps, and the receipt replaces the plan', async () => {
    const { opened, view } = await render();
    await pressTwice(opened);
    const sweep = http.expectOne(SWEEP);
    expect(sweep.request.method).toBe('POST');
    sweep.flush(await goldenMaster(PLANNABLE, 'sweepArtifactsCleanupRepository', ORCHESTRATOR));
    await opened.settled();
    expect(reached()).toEqual([
      'ask-artifacts-cleanup-run:asked',
      'sweep-artifacts-repository:swept',
    ]);
    await expect.element(view.getByRole('heading', { name: 'What the run did' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent('0 identities deleted, 0 blob files unlinked, 0 B reclaimed.');
    await expect
      .element(view.getByRole('list', { name: 'Withheld' }))
      .toMatchTextContent('contract-daemon@2026.0.1');
    // The plan is gone: its lists and its Run with it.
    expect(view.getByRole('list', { name: 'Would be deleted' }).elements()).toHaveLength(0);
    expect(view.getByRole('list', { name: 'Pin sources' }).elements()).toHaveLength(0);
    expect(view.getByRole('button', { name: /^Run:/ }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('receipt', { kind: 'DATA' });
  });

  it('reread-artifacts-cleanup-plan reread: Re-read under a receipt drops it and reads the plan again', async () => {
    const { opened, view } = await render();
    await pressTwice(opened);
    http
      .expectOne(SWEEP)
      .flush(await goldenMaster(PLANNABLE, 'sweepArtifactsCleanupRepository', ORCHESTRATOR));
    await opened.settled();
    await view
      .getByRole('region', { name: 'What the run did' })
      .getByRole('button', { name: 'Re-read the plan' })
      .click();
    await opened.idle();
    expect(reached()).toEqual([
      'ask-artifacts-cleanup-run:asked',
      'sweep-artifacts-repository:swept',
      'reread-artifacts-cleanup-plan:reread',
    ]);
    expect(view.getByRole('heading', { name: 'What the run did' }).elements()).toHaveLength(0);
    await answerPlan(opened);
    await expect
      .element(view.getByRole('list', { name: 'Would be deleted' }))
      .toMatchTextContent('contract-daemon@2026.0.1');
  });

  it('reads the plan again from the header', async () => {
    const { opened, view } = await render();
    await view.getByRole('button', { name: 'Re-read the plan' }).click();
    await opened.idle();
    expect(reached()).toEqual(['reread-artifacts-cleanup-plan:reread']);
    await answerPlan(opened);
  });

  it('sweep-artifacts-repository refused: a 409 did not run, and nothing was deleted', async () => {
    const { opened, view } = await render();
    await pressTwice(opened);
    http
      .expectOne(SWEEP)
      .flush({ message: 'a gc run is active' }, { status: 409, statusText: 'Conflict' });
    await opened.settled();
    expect(reached()).toEqual([
      'ask-artifacts-cleanup-run:asked',
      'sweep-artifacts-repository:refused',
    ]);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('The cleanup did not run — a gc run is active. Nothing was deleted.');
    // Not sent again by itself.
    http.expectNone(SWEEP);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('run-refused', { kind: 'ERROR' });
  });

  it('says no receipt came back when the sweep’s answer is lost, and to re-read the plan', async () => {
    const { opened, view } = await render();
    await pressTwice(opened);
    http.expectOne(SWEEP).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(
        'No receipt came back — 502. This page cannot tell whether anything was deleted: re-read the plan before running it again.',
      );
    http.expectNone(SWEEP);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('run-lost', { kind: 'ERROR' });
  });

  it('says so when the store holds no repository of that name', async () => {
    const opened = await open('no-such-store');
    http
      .expectOne('/orchestrator/api/artifacts/repositories/no-such-store/plan')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('There is no repository called “no-such-store” in this store.');
    expect(opened.page.textContent).not.toContain('could not be read');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown-repository', { kind: 'NO_DATA' });
  });

  it('names the roles when the plan’s read is refused', async () => {
    const opened = await open();
    http.expectOne(PLAN).flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(page.elementLocator(opened.page).getByRole('alert'))
      .toMatchTextContent('Reading a cleanup plan needs one of qits-orchestrator’s gc roles');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(PLAN).flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent('The cleanup plan could not be read. Nothing was deleted.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerPlan(opened);
    await expect
      .element(view.getByRole('list', { name: 'Would be deleted' }))
      .toMatchTextContent('contract-daemon@2026.0.1');
  });

  it('leave-artifacts-cleanup back: the back link opens the repository’s page', async () => {
    const { opened, view } = await render();
    await view.getByRole('link', { name: `← ${REPO}` }).click();
    await opened.settled();
    expect(reached()).toEqual(['leave-artifacts-cleanup:back']);
    expect(TestBed.inject(Router).url).toBe(`/artifacts/repositories/${REPO}`);
    http
      .expectOne('/artifacts/api/repositories')
      .flush(await goldenMaster(STORE, 'listRepositories', ARTIFACTS));
    await opened.settled();
    http
      .expectOne(`/artifacts/api/repositories/${REPO}/daemons`)
      .flush(await goldenMaster(STORE, 'listDaemons', ARTIFACTS));
    await opened.settled();
  });
});
