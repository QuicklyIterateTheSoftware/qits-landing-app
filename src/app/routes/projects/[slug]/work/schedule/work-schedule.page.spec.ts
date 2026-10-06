import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { WorkSchedulePage } from './work-schedule.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const WORK = 'a project with work in every status';

/**
 * The Schedule tab on qits-projects' golden masters: the project list, and "a project with work in
 * every status" (one epic and one ticket per status) for its work. Each listed item's criteria
 * read is answered with a recorded item that has criteria: an epic's with "an epic in detail", a
 * ticket's with "an improvement ticket in detail" (no state records the listed items' own reads).
 */
describe('WorkSchedulePage', () => {
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

  /** The page with `state`'s work and every criteria read answered. */
  async function shown(state = WORK) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const work = goldenMaster(state, 'listProjectEntities');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/schedule`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    http.expectOne(`/projects/api/projects/${project.id}/entities`).flush(work);
    await settle();
    TestBed.tick();
    await settle();
    for (const read of http.match((r) => /^\/projects\/api\/entities\/[^/]+$/.test(r.url))) {
      const ref = read.request.url.split('/').pop();
      const entry = work.entities.find((e: { qualifiedId: string }) => e.qualifiedId === ref);
      read.flush(
        goldenMaster(
          entry.archetype === 'EPIC' ? 'an epic in detail' : 'an improvement ticket in detail',
          'getEntity',
        ),
      );
    }
    await settle();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    const section = (id: string) =>
      element.querySelector<HTMLElement>(`section[aria-labelledby=${id}]`)!;
    /** Each listed item of a section, as its title. */
    const titles = (id: string) =>
      [...section(id).querySelectorAll('li > div > div:first-child > a')].map((a) =>
        a.textContent?.trim(),
      );
    const byTitle = (title: string) =>
      [...element.querySelectorAll<HTMLElement>('section li')].find((li) =>
        li.textContent?.includes(title),
      )!;
    const scheduleButton = () =>
      [...section('schedule-to-schedule').querySelectorAll('button')].find((b) =>
        b.textContent?.trim().startsWith('Schedule'),
      )!;
    const settled = async () => {
      await settle();
      await harness.fixture.whenStable();
    };
    return { work, element, section, titles, byTitle, scheduleButton, settled };
  }

  const idOf = (work: { entities: { title: string; id: string }[] }, title: string) =>
    work.entities.find((e) => e.title === title)!.id;

  it('lists REFINED work to schedule and READY_FOR_DEV work as scheduled, each with its criteria', async () => {
    const { titles, byTitle, scheduleButton } = await shown();
    expect(titles('schedule-to-schedule')).toEqual(['Refined epic', 'Refined ticket']);
    expect(titles('schedule-scheduled')).toEqual(['Ready for dev epic', 'Ready for dev ticket']);
    expect(byTitle('Refined epic').textContent).toContain('It does what it says.');
    expect(byTitle('Ready for dev ticket').textContent).toContain('It does what it says.');
    // Nothing ticked yet: nothing to send.
    expect(scheduleButton().disabled).toBe(true);
    // A feature or a task is never listed on its own: the started epic's pieces are not here.
    expect(byTitle('Started feature')).toBeUndefined();
  });

  it('schedules the ticked items, each on its own, and shows a refusal verbatim', async () => {
    const { work, element, titles, byTitle, scheduleButton, settled } = await shown();
    for (const title of ['Refined epic', 'Refined ticket']) {
      byTitle(title).querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    }
    await settled();
    expect(scheduleButton().disabled).toBe(false);
    expect(scheduleButton().textContent?.trim()).toBe('Schedule 2');
    scheduleButton().click();
    await settle();
    const epic = http.expectOne(`/projects/api/entities/${idOf(work, 'Refined epic')}/status`);
    const ticket = http.expectOne(`/projects/api/entities/${idOf(work, 'Refined ticket')}/status`);
    expect([epic.request.body, ticket.request.body]).toEqual([
      { target: 'READY_FOR_DEV' },
      { target: 'READY_FOR_DEV' },
    ]);
    // A quality gate's refusal, in the service's words (an error answer is a status only to the
    // pact, so its body is written out).
    const refusal =
      'Epic e cannot move to READY_FOR_DEV: PERSON_APPROVAL: scheduling (REFINED → READY_FOR_DEV) ' +
      'needs a person; agent x is a machine credential';
    epic.flush({ message: refusal }, { status: 409, statusText: 'Conflict' });
    ticket.flush(goldenMaster('a refined ticket', 'moveEntityStatus'));
    await settled();
    expect(titles('schedule-to-schedule')).toEqual(['Refined epic']);
    // In the board's order, by number: the ticket was made before the scheduled epic.
    expect(titles('schedule-scheduled')).toEqual([
      'Refined ticket',
      'Ready for dev epic',
      'Ready for dev ticket',
    ]);
    const alert = byTitle('Refined epic').querySelector('[role=alert]')!;
    expect(alert.classList.contains('hidden')).toBe(false);
    expect(alert.textContent?.trim()).toBe(refusal);
    // The refused item stays ticked, so a second press sends it again.
    expect(byTitle('Refined epic').querySelector<HTMLInputElement>('input')!.checked).toBe(true);
    expect(scheduleButton().textContent?.trim()).toBe('Schedule 1');
    expect(element.querySelectorAll('[role=alert]:not(.hidden)').length).toBe(1);
  });

  it('unschedules a scheduled item back to REFINED', async () => {
    const { work, titles, byTitle, settled } = await shown();
    const button = byTitle('Ready for dev ticket').querySelector('button')!;
    expect(button.getAttribute('aria-label')).toMatch(/^Unschedule contract-/);
    button.click();
    await settle();
    const request = http.expectOne(
      `/projects/api/entities/${idOf(work, 'Ready for dev ticket')}/status`,
    );
    expect(request.request.body).toEqual({ target: 'REFINED' });
    // The recorded move of "a ready for dev ticket" (to IMPLEMENTING), with the status this move
    // answers instead: no state records the move back yet.
    const answer = goldenMaster('a ready for dev ticket', 'moveEntityStatus');
    request.flush({ ...answer, status: 'REFINED' });
    await settled();
    expect(titles('schedule-scheduled')).toEqual(['Ready for dev epic']);
    expect(titles('schedule-to-schedule')).toEqual([
      'Refined epic',
      'Refined ticket',
      'Ready for dev ticket',
    ]);
  });

  it('says so when nothing waits', async () => {
    const { element, section } = await shown('a project with no work');
    expect(section('schedule-to-schedule').querySelector('ul')!.classList).toContain('hidden');
    expect(element.textContent).toContain('Nothing to schedule.');
    expect(element.textContent).toContain('Nothing scheduled.');
  });
});
