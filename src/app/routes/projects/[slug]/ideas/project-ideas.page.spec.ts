import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { goldenMaster } from '../../../../../testing/golden-masters';
import { ProjectIdeasPage } from './project-ideas.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';
const API = '/projects/api/ideas';

/**
 * The Ideas page (epic qits-888) on qits-projects' recordings: the open project is the recorded
 * one ("a project exists"), its ideas "a project with ideas"' list (a QUEUED and a PLANNED idea).
 * The list with the archived ones has no recording of its own: it is answered with the same list,
 * one idea marked archived, as the service marks it.
 */
describe('ProjectIdeasPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/ideas', component: ProjectIdeasPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        // The resources' `refreshOn` (qits-2146) follows the same stream.
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
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

  /** The list reads: the generated client writes the query into the URL. */
  const listReads = () =>
    http.match((req) => req.method === 'GET' && req.urlWithParams.split('?')[0] === API);
  /** A read's query parameter. */
  const queryOf = (read: { request: { urlWithParams: string } }, name: string) =>
    new URL(read.request.urlWithParams, 'http://localhost').searchParams.get(name);

  async function shown(answer: unknown = goldenMaster(IDEAS, 'listIdeas')) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/ideas`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    const [read] = listReads();
    expect(queryOf(read, 'project')).toBe(project.id);
    expect(queryOf(read, 'archived')).toBeNull();
    read.flush(answer as object);
    await settle();
    await harness.fixture.whenStable();
    return { harness, project, element: harness.routeNativeElement as HTMLElement };
  }

  /** Runs the page's effects and lets the client build its requests. */
  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  const titles = (element: HTMLElement) =>
    [...element.querySelectorAll('ul[aria-label=Ideas] a')].map((a) => a.textContent?.trim());

  it('lists the project’s ideas, each linking its page', async () => {
    const { element, project } = await shown();
    expect(titles(element)).toEqual(['Faster builds', 'Share the build cache']);
    const link = element.querySelector('ul[aria-label=Ideas] a') as HTMLAnchorElement;
    const id = goldenMaster(IDEAS, 'listIdeas').ideas[0].id;
    expect(link.getAttribute('href')).toBe(`/projects/${project.slug}/ideas/detail/${id}`);
    expect(element.textContent).toContain('queued');
  });

  it('narrows the list by status in the page, reading nothing again', async () => {
    const { element, harness } = await shown();
    const button = (label: string) =>
      [...element.querySelectorAll('[aria-label=Status] button')].find(
        (b) => b.textContent?.trim() === label,
      ) as HTMLButtonElement;
    button('planned').click();
    harness.fixture.detectChanges();
    expect(titles(element)).toEqual(['Share the build cache']);
    button('done').click();
    harness.fixture.detectChanges();
    expect(titles(element)).toEqual([]);
    expect(element.textContent).toContain('No done ideas.');
    button('All').click();
    harness.fixture.detectChanges();
    expect(titles(element)).toHaveLength(2);
    expect(listReads()).toHaveLength(0);
  });

  it('reads the list with the archived ones when Show archived is on', async () => {
    const { element, harness, project } = await shown();
    const box = element.querySelector('input[aria-label="Show archived"]') as HTMLInputElement;
    box.click();
    await ticked();
    const [read] = listReads();
    expect(queryOf(read, 'project')).toBe(project.id);
    expect(queryOf(read, 'archived')).toBe('true');
    // Derived from the recorded list: its second idea archived, as `archived=true` answers it.
    const recorded = goldenMaster(IDEAS, 'listIdeas');
    read.flush({
      ideas: recorded.ideas.map((idea: object, i: number) => ({ ...idea, archived: i === 1 })),
    });
    await settle();
    await harness.fixture.whenStable();
    expect(element.querySelectorAll('ul[aria-label=Ideas] li')[1].textContent).toContain(
      'archived',
    );
  });

  it('reads the list again after an idea event about the project, never another project’s', async () => {
    const { project } = await shown();
    const event = (name: string, projectId: string) => ({
      name,
      payload: JSON.stringify({ ideaId: 'i1', projectId }),
    });
    vi.useFakeTimers();
    try {
      events.next(event('IdeaCreated', 'another-project'));
      events.next(event('IdeaArchived', 'another-project'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    expect(listReads()).toHaveLength(0);

    vi.useFakeTimers();
    try {
      events.next(event('IdeaUpdated', project.id));
      events.next(event('IdeaCreated', project.id));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    // The resource's reload starts its read on the next tick (qits-2146).
    await ticked();
    const reads = listReads();
    expect(reads).toHaveLength(1);
    reads[0].flush(goldenMaster(IDEAS, 'listIdeas'));
    await settle();
  });

  it('says a failed read failed, with Retry', async () => {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/ideas`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await ticked();
    listReads()[0].flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.textContent).toContain('This project’s ideas could not be read.');
    (
      [...element.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Retry',
      ) as HTMLButtonElement
    ).click();
    await settle();
    listReads()[0].flush(goldenMaster(IDEAS, 'listIdeas'));
    await settle();
    await harness.fixture.whenStable();
    expect(titles(element)).toHaveLength(2);
  });

  describe('ranking by drag (qits-1791)', () => {
    /** A recorded idea, with the status, archived flag and priority given. */
    const idea = (title: string, status: string, priority: number | null, archived = false) => ({
      ...goldenMaster(IDEAS, 'listIdeas').ideas[1],
      id: title.toLowerCase().replace(/ /g, '-'),
      title,
      status,
      priority,
      archived,
    });
    const ranked = () => ({
      ideas: [
        idea('Ranked', 'PLANNED', 2),
        idea('Older', 'QUEUED', null),
        idea('Finished', 'DONE', null),
        idea('Newer', 'PLANNED', null),
      ],
    });

    /** The drag handles, each with its label and whether it is shown. */
    const handles = (element: HTMLElement) =>
      [...element.querySelectorAll('ul[aria-label=Ideas] li button[uiReorderHandle]')].map(
        (button) => ({
          button: button as HTMLButtonElement,
          label: button.getAttribute('aria-label'),
          shown: !button.classList.contains('hidden'),
        }),
      );

    function key(target: Element, name: string): void {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    }

    /** Picks up the idea `title` from the keyboard, moves it with `keys` and drops it. */
    async function dragged(element: HTMLElement, title: string, keys: readonly string[]) {
      const handle = handles(element).find((h) => h.label === `Move ${title}`)!.button;
      key(handle, ' ');
      for (const name of keys) key(handle, name);
      key(handle, ' ');
      await settle();
    }

    const drops = () => http.match((req) => req.method === 'PUT' && req.url.endsWith('/priority'));

    it('lists in rank order, with a handle on every rankable idea only', async () => {
      const { element } = await shown({
        ideas: [
          idea('Older', 'QUEUED', null),
          idea('Finished', 'DONE', 1),
          idea('Ranked', 'PLANNED', 2),
        ],
      });
      expect(titles(element)).toEqual(['Ranked', 'Finished', 'Older']);
      expect(handles(element).map(({ label, shown }) => [label, shown])).toEqual([
        ['Move Ranked', true],
        ['Move Finished', false],
        ['Move Older', true],
      ]);
    });

    it('gives an archived idea no handle', async () => {
      const { element, harness } = await shown(ranked());
      (element.querySelector('input[aria-label="Show archived"]') as HTMLInputElement).click();
      await ticked();
      listReads()[0].flush({ ideas: [...ranked().ideas, idea('Shelved', 'PLANNED', null, true)] });
      await settle();
      await harness.fixture.whenStable();
      const shelved = handles(element).find((h) => h.label === 'Move Shelved');
      expect(shelved?.shown).toBe(false);
    });

    it('sends a drop as its place among the rankable ideas, and orders by the answer', async () => {
      const { element, harness } = await shown(ranked());
      await dragged(element, 'Newer', ['Home']);
      const [drop] = drops();
      expect(drop.request.url).toBe(`${API}/newer/priority`);
      expect(drop.request.body).toEqual({ above: 'ranked' });
      drop.flush({
        items: [
          { id: 'newer', priority: 3 },
          { id: 'ranked', priority: 2 },
        ],
      });
      await settle();
      await harness.fixture.whenStable();
      expect(titles(element)).toEqual(['Newer', 'Ranked', 'Older', 'Finished']);
      expect(listReads()).toHaveLength(0);
    });

    it('anchors below the last rankable idea when dropped at the end', async () => {
      const { element } = await shown(ranked());
      await dragged(element, 'Ranked', ['End']);
      const [drop] = drops();
      expect(drop.request.body).toEqual({ below: 'newer' });
      drop.flush({ items: [] });
      await settle();
    });

    it('sends nothing for a cancelled drag, a drop in place, or one past a DONE idea only', async () => {
      const { element } = await shown(ranked());
      const handle = handles(element).find((h) => h.label === 'Move Newer')!.button;
      key(handle, ' ');
      key(handle, 'ArrowUp');
      key(handle, 'Escape');
      await dragged(element, 'Newer', ['ArrowUp', 'ArrowDown']);
      await dragged(element, 'Newer', ['ArrowUp']);
      expect(drops()).toHaveLength(0);
    });

    it('says why a drop was refused above the list, and reads the list again', async () => {
      const { element, harness } = await shown(ranked());
      await dragged(element, 'Newer', ['Home']);
      drops()[0].flush(
        { message: 'The idea is archived or DONE' },
        { status: 409, statusText: 'Conflict' },
      );
      // Not `whenStable()`: the list's read again is a pending task until it is answered.
      await ticked();
      harness.fixture.detectChanges();
      const alert = element.querySelector('p[role=alert]') as HTMLElement;
      expect(alert.classList.contains('hidden')).toBe(false);
      expect(alert.textContent?.trim()).toBe('The idea is archived or DONE');
      const reads = listReads();
      expect(reads).toHaveLength(1);
      reads[0].flush(ranked());
      await settle();
      await harness.fixture.whenStable();
      expect(titles(element)).toEqual(['Ranked', 'Older', 'Finished', 'Newer']);
    });
  });
});
