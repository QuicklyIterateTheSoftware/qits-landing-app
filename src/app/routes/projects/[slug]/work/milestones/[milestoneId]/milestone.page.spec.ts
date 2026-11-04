import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster, projectsGoldenMasters } from '../../../../../../../testing/golden-masters';
import { MilestonePage } from './milestone.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const UNMET = 'a ticket waiting on an unmet milestone';
const MET = 'a ticket waiting on a met milestone';
const MEMBER = 'a campaign member waiting on a milestone';
const { milestoneId, criterionId } = projectsGoldenMasters.operation(
  UNMET,
  'renameMilestone',
).params;
const API = `/projects/api/milestones/${milestoneId}`;

/**
 * A milestone's page (epic qits-615) on the recorded milestone states: "a ticket waiting on an
 * unmet milestone" (an approval not given; its rename, its restated condition and its approval),
 * "… on a met milestone" (approved) and "a campaign member waiting on a milestone" (needed by a
 * membership). The open project is "a project exists"' one, with no work.
 */
describe('MilestonePage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/work/milestones/:milestoneId', component: MilestonePage },
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

  async function shown(state: string = UNMET) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/work/milestones/${milestoneId}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    http
      .expectOne(`/projects/api/projects/${project.id}/work`)
      .flush(goldenMaster('a project with no work', 'listProjectWork'));
    http.expectOne(API).flush(goldenMaster(state, 'getMilestone'));
    await ticked();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const answered = async () => {
      await ticked();
      await harness.fixture.whenStable();
    };
    return { harness, project, element, button, answered };
  }

  it('shows an unmet milestone, its group and criterion with their dates, and what needs it', async () => {
    const { element, project } = await shown();
    expect(element.querySelector('h1, [role=heading]')?.textContent).toContain(
      'bootstrap test node',
    );
    expect(element.textContent).toContain('not met');
    const group = element.querySelector('[data-group]')!;
    expect(group.textContent).toContain('does not hold');
    expect(group.textContent).toContain('made 2026-01-01 00:00 UTC');
    const criterion = element.querySelector('[data-criterion]')!;
    expect(criterion.textContent).toContain('A person approves');
    expect(criterion.querySelector('button')?.textContent?.trim()).toBe('Approve');
    const needed = element.querySelector('[data-needed-by-work] a')!;
    expect(needed.getAttribute('href')).toBe(
      `/projects/${project.slug}/work/detail/contract-00000001-1`,
    );
  });

  it('shows how a met criterion came to hold, and offers no Approve on it', async () => {
    const { element } = await shown(MET);
    expect(element.textContent).toContain('met since 2026-01-01 00:00 UTC');
    expect(element.querySelector('[data-group]')!.textContent).toContain('holds since');
    expect(element.querySelector('[data-approval]')!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Approved by dev: Node 7 is up.',
    );
    expect(element.querySelector('[data-criterion] button')).toBeNull();
  });

  it('names the campaign membership that needs it', async () => {
    const { element } = await shown(MEMBER);
    const membership = element.querySelector('[data-needed-by-membership]')!;
    expect([...membership.children].map((e) => e.textContent?.trim())).toEqual([
      'contract-00000001-2',
      'as a member of',
      'Ship the bootstrap',
    ]);
  });

  it('approves a criterion with a note, and shows the milestone as the answer has it', async () => {
    const { element, button, answered } = await shown();
    button('Approve')!.click();
    await answered();
    const note = element.querySelector<HTMLInputElement>('[data-criterion] input')!;
    note.value = 'Node 7 is up.';
    note.dispatchEvent(new Event('input'));
    button('Confirm approval')!.click();
    await settle();
    const approve = http.expectOne(`${API}/criteria/${criterionId}/approve`);
    expect(approve.request.body).toEqual({ note: 'Node 7 is up.' });
    approve.flush(goldenMaster(UNMET, 'approveMilestoneCriterion'));
    await answered();
    expect(element.textContent).toContain('Approved by dev: Node 7 is up.');
    expect(button('Approve')).toBeUndefined();
  });

  it('shows a refused approval in the service’s words', async () => {
    const { element, button, answered } = await shown();
    button('Approve')!.click();
    await answered();
    button('Confirm approval')!.click();
    await settle();
    http
      .expectOne(`${API}/criteria/${criterionId}/approve`)
      .flush({ message: 'A person approves.' }, { status: 403, statusText: 'Forbidden' });
    await answered();
    expect(element.querySelector('[role=alert]')?.textContent?.trim()).toBe('A person approves.');
  });

  it('renames the milestone', async () => {
    const { element, button, answered } = await shown();
    button('Rename')!.click();
    await answered();
    const name = element.querySelector<HTMLInputElement>('form input')!;
    name.value = 'bootstrap test node (arm64)';
    name.dispatchEvent(new Event('input'));
    await answered();
    button('Save')!.click();
    await settle();
    const patch = http.expectOne(API);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ displayName: 'bootstrap test node (arm64)' });
    patch.flush(goldenMaster(UNMET, 'renameMilestone'));
    await answered();
    expect(element.querySelector('form')).toBeNull();
  });

  it('restates the condition with the criterion it had, kept by id, OR a new group', async () => {
    const { element, button, answered } = await shown();
    button('Edit criteria')!.click();
    await answered();
    button('Or another group')!.click();
    await answered();
    button('Save criteria')!.click();
    await settle();
    const put = http.expectOne(`${API}/groups`);
    expect(put.request.body).toEqual({
      groups: [
        { criteria: [{ id: criterionId, kind: 'APPROVAL', predicate: {} }] },
        { criteria: [{ kind: 'APPROVAL', predicate: {} }] },
      ],
    });
    put.flush(goldenMaster(UNMET, 'setMilestoneGroups'));
    await answered();
    expect(element.querySelectorAll('[data-group]')).toHaveLength(2);
  });

  it('reads the milestone again after MilestoneMet about the open project', async () => {
    const { project } = await shown();
    vi.useFakeTimers();
    try {
      events.next({
        name: 'MilestoneMet',
        payload: JSON.stringify({ milestoneId, projectId: project.id }),
      });
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectOne(API).flush(goldenMaster(MET, 'getMilestone'));
    await settle();
  });
});
