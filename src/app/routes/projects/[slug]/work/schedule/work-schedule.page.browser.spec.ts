import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { WorkSchedulePage } from './work-schedule.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';

/**
 * Screenshots of a project's Schedule tab, answered with qits-projects' golden masters: the
 * project list as recorded, and "a project with work in every status" (one epic and one ticket per
 * status) or "a project with no work" for its work. Each listed item's acceptance criteria come
 * from a recorded item that has some: an epic's read from "an epic in detail", a ticket's from "an
 * improvement ticket in detail" (no state records the listed items' own reads).
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** A single entity's read: `/projects/api/work/<qualified id>`. */
const ENTITY_READ = /^\/projects\/api\/work\/[^/]+$/;

describe('WorkSchedulePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/schedule', component: WorkSchedulePage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page of the recorded project, with the list answered and its work requested. */
  async function shown() {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/schedule`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    // SelectedWork's effect asks for the work once the project is known; let it run.
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    const work = http.expectOne(`/projects/api/projects/${project.id}/work`);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    const answered = async () => {
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    };
    return { element, locator: page.elementLocator(element), work, answered };
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
    const { locator, work, answered } = await shown();
    const recorded = await goldenMaster('a project with work in every status', 'listProjectWork');
    work.flush(recorded);
    await answered();
    await answerCriteria(recorded.entities);
    await answered();
    await expect.element(locator.getByRole('heading', { level: 1 })).toMatchTextContent('Schedule');
    await expect.element(locator).toMatchTextContent('Refined epic');
    await expect.element(locator).toMatchTextContent('Ready for dev ticket');
    await expect.element(locator).toMatchTextContent('It does what it says.');
    await expect.element(locator).not.toMatchTextContent('Implementing ticket');
    await expect.element(locator).toMatchScreenshot('lists');
  });

  it('shows the service’s refusal under an item it would not schedule', async () => {
    const { element, locator, work, answered } = await shown();
    const recorded = await goldenMaster('a project with work in every status', 'listProjectWork');
    work.flush(recorded);
    await answered();
    await answerCriteria(recorded.entities);
    await answered();
    await locator.getByRole('checkbox').first().click();
    await answered();
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
    await answered();
    await expect.element(locator.getByRole('alert')).toMatchTextContent('PERSON_APPROVAL');
    expect(element.querySelectorAll('[role=alert]:not(.hidden)').length).toBe(1);
    await expect.element(locator).toMatchScreenshot('refused');
  });

  it('says so when nothing waits to be scheduled', async () => {
    const { locator, work, answered } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectWork'));
    await answered();
    await expect.element(locator).toMatchTextContent('Nothing to schedule.');
    await expect.element(locator).toMatchTextContent('Nothing scheduled.');
    await expect.element(locator).toMatchScreenshot('empty');
  });

  it('shows that the work is loading', async () => {
    const { locator, work } = await shown();
    await expect.element(locator.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(locator).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });
});
