import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster } from '../../../../../../testing/golden-masters';
import { pendingGoldenMaster } from '../../../../../../testing/pending-golden-masters';
import { WorkMilestonesPage } from './work-milestones.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const MET = 'a ticket waiting on a met milestone';
const UNMET = 'a ticket waiting on an unmet milestone';

/**
 * The Milestones page (epic qits-615) on "a ticket waiting on a met milestone"'
 * `listProjectMilestones` (one met, one unmet) and "a ticket waiting on an unmet milestone"'s
 * `createMilestone`. The open project is "a project exists"' one.
 */
describe('WorkMilestonesPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/work/milestones', component: WorkMilestonesPage },
          { path: 'projects/:slug/work/milestones/:milestoneId', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  async function shown() {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/milestones`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    const url = `/projects/api/projects/${project.id}/milestones`;
    http.expectOne(url).flush(pendingGoldenMaster(MET, 'listProjectMilestones'));
    await ticked();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const rows = () =>
      [...element.querySelectorAll('[data-milestone]')].map((row) => ({
        name: row.querySelector('a')!.textContent?.trim(),
        chip: row.querySelector('ui-chip')!.textContent?.trim(),
        neededBy: row.querySelector('[data-needed-by]')!.textContent?.trim(),
      }));
    return { harness, project, element, button, rows, url };
  }

  it('lists every milestone, met or not, with what needs it, linked to its page', async () => {
    const { element, rows, project } = await shown();
    expect(rows()).toEqual([
      {
        name: 'bootstrap test node',
        chip: 'met since 2026-01-01 00:00 UTC',
        neededBy: '1 item needs it',
      },
      { name: 'arm64 runner', chip: 'not met', neededBy: 'Nothing needs it' },
    ]);
    const answer = pendingGoldenMaster(MET, 'listProjectMilestones');
    expect(element.querySelector('[data-milestone] a')!.getAttribute('href')).toBe(
      `/projects/${project.slug}/work/milestones/${answer.milestones[0].id}`,
    );
  });

  it('filters the met and the unmet ones in the page', async () => {
    const { harness, button, rows } = await shown();
    button('Not met')!.click();
    harness.fixture.detectChanges();
    expect(rows().map((r) => r.name)).toEqual(['arm64 runner']);
    button('Met')!.click();
    harness.fixture.detectChanges();
    expect(rows().map((r) => r.name)).toEqual(['bootstrap test node']);
  });

  it('creates a milestone from a name and a criterion, then goes to its page', async () => {
    const { harness, element, button, project, url } = await shown();
    button('New milestone')!.click();
    harness.fixture.detectChanges();
    expect(button('Create')!.disabled).toBe(true);
    const name = element.querySelector<HTMLInputElement>('form input')!;
    name.value = 'bootstrap ticket done';
    name.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
    expect(button('Create')!.disabled).toBe(false);
    button('Create')!.click();
    await settle();
    const write = http.expectOne((req) => req.method === 'POST' && req.url === url);
    expect(write.request.body).toEqual({
      displayName: 'bootstrap ticket done',
      groups: [{ criteria: [{ kind: 'APPROVAL', predicate: {} }] }],
    });
    const created = pendingGoldenMaster(UNMET, 'createMilestone');
    write.flush(created, { status: 201, statusText: 'Created' });
    await ticked();
    http
      .expectOne((req) => req.method === 'GET' && req.url === url)
      .flush(pendingGoldenMaster(UNMET, 'listProjectMilestones'));
    await ticked();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${project.slug}/work/milestones/${created.milestone.id}`,
    );
  });

  it('shows a refused create in the service’s words, and keeps the form', async () => {
    const { harness, element, button, url } = await shown();
    button('New milestone')!.click();
    harness.fixture.detectChanges();
    const name = element.querySelector<HTMLInputElement>('form input')!;
    name.value = 'x';
    name.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
    button('Create')!.click();
    await settle();
    http
      .expectOne((req) => req.method === 'POST' && req.url === url)
      .flush(
        { message: 'group 1, criterion 1: unknown kind X' },
        { status: 400, statusText: 'Bad Request' },
      );
    await ticked();
    expect(element.querySelector('form [role=alert]')?.textContent?.trim()).toBe(
      'group 1, criterion 1: unknown kind X',
    );
  });

  it('reads the list again after a milestone of the project is met, not another project’s', async () => {
    const { project, url } = await shown();
    const met = (projectId: string) => ({
      name: 'MilestoneMet',
      payload: JSON.stringify({ milestoneId: 'm', projectId }),
    });
    vi.useFakeTimers();
    try {
      events.next(met('another-project'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectNone(url);
    vi.useFakeTimers();
    try {
      events.next(met(project.id));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectOne(url).flush(pendingGoldenMaster(MET, 'listProjectMilestones'));
    await settle();
  });
});
