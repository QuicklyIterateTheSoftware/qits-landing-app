import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { IN_PROGRESS_VIEW_KEY } from '$core/work/in-progress-view';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import {
  answerWrapperClosings,
  WRAPPER_CLOSINGS,
} from '../../../../../../testing/browser/recorded-work';

/**
 * Screenshots of a project's Acceptance page inside the shell and the work tabs (`openRoute`),
 * answered with qits-projects' golden masters: the project list as recorded, and "a project with work in every status" (one epic and one ticket per
 * status) or "a project with no work" for its work. The finish and its Undo are the list's spec
 * (`work-list.browser.spec.ts`). A VERIFIED ticket's line asks for the project's wrapper closings
 * (qits-1873), answered from "a project with VERIFIED tickets in every wrapper verdict"
 * (`WRAPPER_CLOSINGS`, `answerWrapperClosings`). Drawn from that state's own work, each of its five
 * tickets says its verdict; the closings do not name the VERIFIED ticket of "a project with work in
 * every status", which keeps "Closes once its release lands".
 *
 * The page follows the In Progress tab's view (qits-2051): "an implementing epic with features in
 * mixed statuses" shows its VERIFIED feature here only in the inline view, which a test picks by
 * storing it in `localStorage` before the page opens; with the epic boards (the default) that
 * feature is on its epic's board instead.
 */

const MIXED = 'an implementing epic with features in mixed statuses';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkAcceptancePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // As wide as the page was plus the sidebar, and tall enough for its verified work.
    await page.viewport(1040, 700);
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    localStorage.removeItem(IN_PROGRESS_VIEW_KEY);
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of the recorded project, with its work requested. */
  async function shown() {
    const opened = await openRoute((project) => `/projects/${project.slug}/work/acceptance`);
    const work = http.expectOne(`/projects/api/projects/${opened.project.id}/work`);
    return {
      element: page.elementLocator(opened.page),
      frame: page.elementLocator(opened.frame),
      work,
      answered: opened.settled,
      projectId: opened.project.id,
    };
  }

  // qits-150: the epic carries its finish button; the ticket shows the quiet hint instead.
  it('shows the verified work, the epic with its finish button, the ticket with its hint', async () => {
    const { element, frame, work, answered, projectId } = await shown();
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await answered();
    // qits-1873: the ticket's line asks for the closings, which do not name it.
    expect(await answerWrapperClosings(http, projectId)).toBe(true);
    await answered();
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toMatchTextContent('Acceptance');
    await expect.element(element).toMatchTextContent('Verified epic');
    await expect.element(element).toMatchTextContent('Verified ticket');
    await expect.element(element).not.toMatchTextContent('Verifying ticket');
    await expect.element(element).not.toMatchTextContent('Done ticket');
    await expect.element(element).toMatchTextContent('Closes once its release lands');
    expect(element.getByRole('button').elements().length).toBeGreaterThanOrEqual(1);
    await expect.element(frame).toMatchScreenshot('acceptance', { kind: 'DATA' });
  });

  // qits-1873: each VERIFIED ticket's card says how its wrapper closing stands, the request linked.
  it('says how each verified ticket’s wrapper closing stands', async () => {
    // Tall enough for all five cards: the shell shows only what is in the viewport.
    await page.viewport(1040, 1100);
    const { element, frame, work, answered, projectId } = await shown();
    work.flush(await goldenMaster(WRAPPER_CLOSINGS, 'listProjectWork'));
    await answered();
    expect(await answerWrapperClosings(http, projectId)).toBe(true);
    await answered();
    const root = element.element();
    const list = await goldenMaster('a project exists', 'listProjects');
    const requests = `/projects/${list.entries[0].project.slug}/release-requests`;
    /** The closing line on the card of `ticket`. */
    const lineOf = (ticket: string) =>
      [...root.querySelectorAll('ui-board-card')]
        .find((card) => card.textContent?.includes(ticket))
        ?.querySelector('app-wrapper-closing span');
    const hrefOf = (ticket: string) => lineOf(ticket)?.querySelector('a')?.getAttribute('href');
    const cases: readonly [ticket: string, words: string, request: string | null][] = [
      ['contract-00000001-1', 'Waits for its wrapper release request', null],
      [
        'contract-00000001-2',
        'Closes with contract-00000001-contract-00000001-rr-1, pending',
        'contract-00000001-contract-00000001-rr-1',
      ],
      [
        'contract-00000001-3',
        'Closes now: contract-00000001-contract-00000001-rr-2 finalized',
        'contract-00000001-contract-00000001-rr-2',
      ],
      ['contract-00000001-4', 'Closes now: nothing left to release', null],
      [
        'contract-00000001-5',
        'Its wrapper request contract-00000001-contract-00000001-rr-4 ended without proof, so it cannot close by itself',
        'contract-00000001-contract-00000001-rr-4',
      ],
    ];
    for (const [ticket, words, request] of cases) {
      expect(lineOf(ticket)?.textContent).toBe(words);
      if (request) expect(hrefOf(ticket)).toBe(`${requests}/${request}`);
      expect(lineOf(ticket)?.querySelector('a')?.classList.contains('hidden')).toBe(!request);
    }
    // UNPROVEN alone is a warning.
    expect(root.querySelectorAll('app-wrapper-closing [data-warning]')).toHaveLength(1);
    expect(lineOf('contract-00000001-5')?.classList.contains('text-sunflower-gold-800')).toBe(true);
    // The REFINED ticket is not in Acceptance.
    await expect.element(element).not.toMatchTextContent('Not verified yet');
    await expect.element(frame).toMatchScreenshot('wrapper-closings', { kind: 'DATA' });
    // The empty wrapper's withdrawal and the UNPROVEN warning are also shot card by card, close up.
    for (const [ticket, name] of [
      ['contract-00000001-4', 'wrapper-closings-withdrawn'],
      ['contract-00000001-5', 'wrapper-closings-unproven'],
    ]) {
      const card = lineOf(ticket)?.closest('ui-board-card') as HTMLElement;
      card.scrollIntoView();
      await expect.element(page.elementLocator(card)).toMatchScreenshot(name, { kind: 'DATA' });
    }
  });

  // qits-1873: without the closings, a ticket's line stays the generic hint.
  it('keeps the ticket’s hint when the wrapper closings fail', async () => {
    const { element, frame, work, answered, projectId } = await shown();
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await answered();
    TestBed.tick();
    await settle();
    http
      .expectOne(`/projects/api/projects/${projectId}/wrapper-closings`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered();
    await expect.element(element).toMatchTextContent('Verified ticket');
    await expect.element(element).toMatchTextContent('Closes once its release lands');
  });

  it('says so when nothing waits to be accepted', async () => {
    const { element, frame, work, answered } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectWork'));
    await answered();
    await expect.element(element).toMatchTextContent('Nothing here');
    await expect.element(frame).toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('leaves out the verified feature of an epic still on its board, with epic boards', async () => {
    const { element, frame, work, answered } = await shown();
    work.flush(await goldenMaster(MIXED, 'listProjectWork'));
    await answered();
    await expect.element(element).toMatchTextContent('Nothing here');
    await expect.element(element).not.toMatchTextContent('Verified feature');
    await expect.element(element).not.toMatchTextContent('Epic with mixed features');
    await expect.element(frame).toMatchScreenshot('epic-boards-mixed-data', { kind: 'NO_DATA' });
  });

  it('lists the verified feature under its epic, inline', async () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'inline');
    const { element, frame, work, answered } = await shown();
    work.flush(await goldenMaster(MIXED, 'listProjectWork'));
    await answered();
    await expect.element(element).toMatchTextContent('Verified feature');
    await expect.element(element).toMatchTextContent('Verified task');
    await expect.element(element).toMatchTextContent('Epic with mixed features');
    await expect.element(frame).toMatchScreenshot('inline-mixed-data', { kind: 'DATA' });
  });

  it('says that the work could not be read', async () => {
    const { element, frame, work, answered } = await shown();
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await answered();
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(frame).toMatchScreenshot('error', { kind: 'ERROR' });
  });

  it('shows that the work is loading', async () => {
    const { element, frame, work, answered } = await shown();
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(frame).toMatchScreenshot('loading', { kind: 'PENDING' });
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await answered();
  });
});
