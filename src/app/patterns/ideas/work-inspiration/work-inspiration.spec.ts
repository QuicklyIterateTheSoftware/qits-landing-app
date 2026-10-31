import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster, projectsGoldenMasters } from '../../../../testing/golden-masters';
import { WorkInspiration } from './work-inspiration';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';
const params = projectsGoldenMasters.operation(IDEAS, 'getIdea').params;

/**
 * A work item's inspiration (epic qits-888), on "a project with ideas"' recordings: the idea read is
 * its `getIdea`, the picker's list its `listIdeas`. No recording holds a work item naming an idea
 * nor a patch of `inspiredBy`; the patch is answered with "a project with no work"'s created ticket.
 */
describe('WorkInspiration', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
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

  async function render(archetype: string, inspiredBy?: string) {
    const fixture = TestBed.createComponent(WorkInspiration);
    fixture.componentRef.setInput('slug', 'contract');
    fixture.componentRef.setInput('projectId', params['projectId']);
    fixture.componentRef.setInput('qualifiedId', 'contract-00000001-1');
    fixture.componentRef.setInput('archetype', archetype);
    fixture.componentRef.setInput('inspiredBy', inspiredBy);
    fixture.detectChanges();
    await settle();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    return { fixture, element, button };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('names the inspiring idea, linked to its page', async () => {
    const id = params['ideaId'];
    const { fixture, element } = await render('EPIC', id);
    http.expectOne(`/projects/api/ideas/${id}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await answered(fixture);
    const link = element.querySelector('[data-inspired-by] a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Faster builds');
    expect(link.getAttribute('href')).toBe(`/projects/contract/ideas/detail/${id}`);
  });

  it('reads nothing for an item that names no idea, and shows nothing on an unknown archetype', async () => {
    const ticket = await render('TICKET');
    expect(ticket.element.textContent).toContain('Inspired by no idea.');
    const unknown = await render('SOMETHING_ELSE');
    expect(unknown.element.querySelector('section')!.classList).toContain('hidden');
  });

  it('shows the editable picker on a feature and a task too (qits-1792)', async () => {
    const feature = await render('FEATURE');
    expect(feature.element.querySelector('section')!.classList).not.toContain('hidden');
    expect(feature.element.textContent).toContain('Inspired by no idea.');
    expect(feature.button('Choose an idea')).toBeTruthy();
    const task = await render('TASK');
    expect(task.element.querySelector('section')!.classList).not.toContain('hidden');
    expect(task.button('Choose an idea')).toBeTruthy();
  });

  it('sets an idea of the project, read when the picker opens', async () => {
    const { fixture, element, button } = await render('TICKET');
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    button('Choose an idea')!.click();
    fixture.detectChanges();
    await settle();
    http
      .expectOne((req) => req.urlWithParams.startsWith('/projects/api/ideas?'))
      .flush(goldenMaster(IDEAS, 'listIdeas'));
    await answered(fixture);
    const select = element.querySelector<HTMLSelectElement>('select[aria-label="Idea"]')!;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      'Choose an idea…',
      'Faster builds',
      'Share the build cache',
    ]);
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('Save')!.click();
    await settle();
    const patch = http.expectOne('/projects/api/work/contract-00000001-1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ inspiredBy: params['ideaId'] });
    patch.flush(goldenMaster(NO_WORK, 'createWork'));
    await answered(fixture);
    expect(changed).toBe(1);
    expect(element.querySelector('select')).toBeNull();
  });

  it('clears it, and shows a refusal in the service’s words', async () => {
    const id = params['ideaId'];
    const { fixture, element, button } = await render('CAMPAIGN', id);
    http.expectOne(`/projects/api/ideas/${id}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await answered(fixture);
    button('Clear')!.click();
    await settle();
    const patch = http.expectOne('/projects/api/work/contract-00000001-1');
    expect(patch.request.body).toEqual({ inspiredBy: null });
    // An error answer is a status and anything.
    patch.flush(
      { message: 'inspiredBy names no idea of this project' },
      { status: 400, statusText: 'Bad Request' },
    );
    await answered(fixture);
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'inspiredBy names no idea of this project',
    );
  });

  it('reads the inspiring idea again after an idea event about the project only', async () => {
    const id = params['ideaId'];
    const { fixture } = await render('EPIC', id);
    http.expectOne(`/projects/api/ideas/${id}`).flush(goldenMaster(IDEAS, 'getIdea'));
    await answered(fixture);
    const event = (projectId: string) => ({
      name: 'IdeaUpdated',
      payload: JSON.stringify({ ideaId: id, projectId }),
    });
    vi.useFakeTimers();
    try {
      events.next(event('another-project'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectNone(`/projects/api/ideas/${id}`);
    vi.useFakeTimers();
    try {
      events.next(event(params['projectId']));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectOne(`/projects/api/ideas/${id}`).flush(goldenMaster(IDEAS, 'getIdea'));
  });
});
