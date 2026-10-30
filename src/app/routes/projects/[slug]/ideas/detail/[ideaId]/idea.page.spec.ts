import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster, projectsGoldenMasters } from '../../../../../../../testing/golden-masters';
import { IdeaPage } from './idea.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';
const API = '/projects/api/ideas';
const ideaId = projectsGoldenMasters.operation(IDEAS, 'getIdea').params['ideaId'];

/**
 * An idea's page (epic qits-888) on "a project with ideas"' `getIdea` (an idea that enables
 * another and inspired an epic; nothing enables it). The open project is "a project exists"' one.
 */
describe('IdeaPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/ideas/detail/:ideaId', component: IdeaPage },
          { path: 'projects/:slug/ideas/detail/:ideaId/edit', children: [] },
          { path: 'projects/:slug/work/create', children: [] },
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

  /** The page, its idea answered with `idea` (the recording unless given). */
  async function shown(idea: object = goldenMaster(IDEAS, 'getIdea')) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/ideas/detail/${ideaId}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    http.expectOne(`${API}/${ideaId}`).flush(idea);
    await ticked();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    return { harness, project, element, button };
  }

  it('shows the idea, the ideas it enables and the work it inspired, linked', async () => {
    const { element, project } = await shown();
    expect(element.textContent).toContain('queued');
    expect(element.textContent).toContain('Share the cache across runners.');
    const enables = element.querySelector('section[aria-label=Enables] a') as HTMLAnchorElement;
    expect(enables.textContent?.trim()).toBe('Share the build cache');
    const work = element.querySelector('[data-work-item]') as HTMLAnchorElement;
    expect(work.getAttribute('href')).toBe(
      `/projects/${project.slug}/work/detail/contract-00000001-1`,
    );
    expect(element.querySelector('section[aria-label="Enabled by"]')?.textContent).toContain(
      'No idea.',
    );
  });

  it('links the idea enabling it, and says when that idea is archived', async () => {
    // Derived from the recording: enabled by its own enabled idea, archived, as `enabledByIdea`
    // names an enabling idea (no recording holds one yet).
    const recorded = goldenMaster(IDEAS, 'getIdea');
    const enabler = recorded.enables[0];
    const { element, project } = await shown({
      ...recorded,
      enabledBy: enabler.id,
      enabledByIdea: { ...enabler, archived: true },
    });
    const section = element.querySelector('section[aria-label="Enabled by"]')!;
    expect(section.querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/ideas/detail/${enabler.id}`,
    );
    expect(section.querySelector('[data-enabler-archived]')?.textContent).toContain(
      'That idea is archived.',
    );
  });

  it('archives with the reason it asks for, then reads the idea again', async () => {
    const { element, button, harness } = await shown();
    button('Archive')!.click();
    harness.fixture.detectChanges();
    expect(button('Confirm archive')!.disabled).toBe(true);
    const reason = element.querySelector<HTMLTextAreaElement>('textarea[aria-label=Reason]')!;
    reason.value = 'Folded into the cache epic.';
    reason.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
    button('Confirm archive')!.click();
    await settle();
    const archive = http.expectOne(`${API}/${ideaId}/archive`);
    expect(archive.request.body).toEqual({ reason: 'Folded into the cache epic.' });
    archive.flush(goldenMaster(IDEAS, 'archiveIdea'));
    await ticked();
    http.expectOne(`${API}/${ideaId}`).flush({
      ...goldenMaster<object>(IDEAS, 'getIdea'),
      archived: true,
      archiveReason: 'Folded.',
    });
    await ticked();
    harness.fixture.detectChanges();
    expect(element.querySelector('[data-archived]')).not.toBeNull();
    expect(button('Unarchive')).toBeDefined();
  });

  it('shows a refused archive in the service’s words', async () => {
    const { element, button, harness } = await shown();
    button('Archive')!.click();
    harness.fixture.detectChanges();
    const reason = element.querySelector<HTMLTextAreaElement>('textarea[aria-label=Reason]')!;
    reason.value = 'Because.';
    reason.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
    button('Confirm archive')!.click();
    await settle();
    http
      .expectOne(`${API}/${ideaId}/archive`)
      .flush(
        { message: 'the idea is archived already' },
        { status: 400, statusText: 'Bad Request' },
      );
    await ticked();
    harness.fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'the idea is archived already',
    );
  });

  it('unarchives an archived idea', async () => {
    const { button, harness } = await shown({
      ...goldenMaster<object>(IDEAS, 'getIdea'),
      archived: true,
    });
    button('Unarchive')!.click();
    await settle();
    http.expectOne(`${API}/${ideaId}/unarchive`).flush(goldenMaster(IDEAS, 'unarchiveIdea'));
    await ticked();
    http.expectOne(`${API}/${ideaId}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await ticked();
    harness.fixture.detectChanges();
    expect(button('Archive')).toBeDefined();
  });

  it('opens the work create form filled with the idea, as its inspiration', async () => {
    const { button, project } = await shown();
    button('Create epic')!.click();
    await settle();
    const url = new URL(TestBed.inject(Router).url, 'http://localhost');
    expect(url.pathname).toBe(`/projects/${project.slug}/work/create`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      archetype: 'EPIC',
      title: 'Faster builds',
      description: 'Cache the dependencies between runs.\n\nShare the cache across runners.',
      inspiredBy: ideaId,
    });
  });

  it('reads the idea again after an idea event about the project, never another project’s', async () => {
    const { project } = await shown();
    const event = (projectId: string) => ({
      name: 'IdeaUpdated',
      payload: JSON.stringify({ ideaId: 'another', projectId }),
    });
    vi.useFakeTimers();
    try {
      events.next(event('another-project'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectNone(`${API}/${ideaId}`);
    vi.useFakeTimers();
    try {
      events.next(event(project.id));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectOne(`${API}/${ideaId}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await settle();
  });
});
