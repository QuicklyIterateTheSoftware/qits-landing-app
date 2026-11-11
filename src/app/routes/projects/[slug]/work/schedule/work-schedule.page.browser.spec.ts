import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';

/**
 * Screenshots of a project's Schedule tab inside the shell and the work tabs (`openRoute`),
 * answered with qits-projects' golden masters: the project list as recorded, and "a project with
 * work in every status" (one epic and one ticket per status) or "a project with no work" for its
 * work. Each listed item's acceptance criteria come from a recorded item that has some: an epic's
 * read from "an epic in detail", a ticket's from "an improvement ticket in detail" (no state
 * records the listed items' own reads).
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** A single entity's read: `/projects/api/work/<qualified id>`. */
const ENTITY_READ = /^\/projects\/api\/work\/[^/]+$/;

describe('WorkSchedulePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // As wide as the page was plus the sidebar, and tall enough for both lists.
    await page.viewport(1040, 1000);
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of the recorded project, with its work requested. */
  async function shown() {
    const opened = await openRoute((project) => `/projects/${project.slug}/work/schedule`);
    const work = http.expectOne(`/projects/api/projects/${opened.project.id}/work`);
    return {
      opened,
      element: opened.page,
      locator: page.elementLocator(opened.page),
      frame: page.elementLocator(opened.frame),
      work,
    };
  }

  /** Answers every criteria read the page made, by the archetype of the item it reads. */
  async function answerCriteria(entities: readonly { qualifiedId: string; archetype: string }[]) {
    TestBed.tick();
    await settle();
    const epic = await goldenMaster('an epic in detail', 'getWork');
    const ticket = await goldenMaster('an improvement ticket in detail', 'getWork');
    for (const read of http.match((r) => ENTITY_READ.test(r.url))) {
      const ref = read.request.url.split('/').pop();
      const item = entities.find((e) => e.qualifiedId === ref);
      read.flush(item?.archetype === 'EPIC' ? epic : ticket);
    }
  }

  it('lists the refined work to schedule and the scheduled work, each with its criteria', async () => {
    const { opened, locator, frame, work } = await shown();
    const recorded = await goldenMaster('a project with work in every status', 'listProjectWork');
    work.flush(recorded);
    await opened.settled();
    await answerCriteria(recorded.entities);
    await opened.settled();
    await expect.element(locator.getByRole('heading', { level: 1 })).toMatchTextContent('Schedule');
    await expect.element(locator).toMatchTextContent('Refined epic');
    await expect.element(locator).toMatchTextContent('Ready for dev ticket');
    await expect.element(locator).toMatchTextContent('It does what it says.');
    await expect.element(locator).not.toMatchTextContent('Implementing ticket');
    await expect.element(frame).toMatchScreenshot('lists', { kind: 'DATA' });
  });

  it('shows the service’s refusal under an item it would not schedule', async () => {
    const { opened, element, locator, frame, work } = await shown();
    const recorded = await goldenMaster('a project with work in every status', 'listProjectWork');
    work.flush(recorded);
    await opened.settled();
    await answerCriteria(recorded.entities);
    await opened.settled();
    await locator.getByRole('checkbox').first().click();
    await opened.settled();
    await locator.getByRole('button', { name: 'Schedule 1' }).click();
    await settle();
    // An error answer is a status only to the pact; its body is the service's message format.
    http
      .expectOne((r) => r.url.endsWith('/status'))
      .flush(
        {
          message:
            'Epic contract-00000001-3 cannot move to READY_FOR_DEV: PERSON_APPROVAL: scheduling ' +
            '(REFINED → READY_FOR_DEV) needs a person; agent qits-agent is a machine credential',
        },
        { status: 409, statusText: 'Conflict' },
      );
    await opened.settled();
    await expect.element(locator.getByRole('alert')).toMatchTextContent('PERSON_APPROVAL');
    expect(element.querySelectorAll('[role=alert]:not(.hidden)').length).toBe(1);
    await expect.element(frame).toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('says so when nothing waits to be scheduled', async () => {
    const { opened, locator, frame, work } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectWork'));
    await opened.settled();
    await expect.element(locator).toMatchTextContent('Nothing to schedule.');
    await expect.element(locator).toMatchTextContent('Nothing scheduled.');
    await expect.element(frame).toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('shows that the work is loading', async () => {
    const { opened, locator, frame, work } = await shown();
    await expect.element(locator.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(frame).toMatchScreenshot('loading', { kind: 'PENDING' });
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });
});
