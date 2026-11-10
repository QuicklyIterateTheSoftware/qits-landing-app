import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { IN_PROGRESS_VIEW_KEY } from '$core/work/in-progress-view';
import { goldenMaster, workspacesGoldenMaster } from '../../../../../../testing/golden-masters';
import { WorkInProgressPage } from './work-in-progress.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const WORK = 'a project with work in every status';
const AGENTS = 'a project with agents bound to work items';

/**
 * Where the work an active agent is on shows on the In Progress tab: before the board when it is
 * not scheduled yet, on the board when its status is a column, and after the board when it is past
 * it. The work is "a project with work in every status". No recorded state puts agents on that
 * project's items, so the agents are "a project with agents bound to work items"'s recorded agent,
 * copied once per item it is put on (`agentsOn`). The view (qits-2051) is the epic boards one unless
 * a test stores another in `localStorage` first.
 */
describe('WorkInProgressPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/in-progress', component: WorkInProgressPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /** The recorded agent, once on each item titled in `titles`. */
  function agentsOn(work: { entities: { id: string; title: string }[] }, titles: string[]) {
    const [agent] = workspacesGoldenMaster(AGENTS, 'listAgents').agents;
    const ids = work.entities.filter((e) => titles.includes(e.title)).map((e) => e.id);
    return { agents: ids.map((workId) => ({ ...agent, workId })) };
  }

  async function shown(titles: string[]) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const work = goldenMaster(WORK, 'listProjectWork');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/in-progress`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    http.expectOne('/workspaces/api/agents?state=ACTIVE').flush(agentsOn(work, titles));
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    http.expectOne(`/projects/api/projects/${project.id}/work`).flush(work);
    await settle();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  const section = (element: HTMLElement, label: string) =>
    element.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;

  /** The epic boards drawn, by their epic's title. */
  const epicBoards = (element: HTMLElement) =>
    [...element.querySelectorAll('app-epic-board > article')].map((a) =>
      a.getAttribute('aria-label'),
    );

  /** The stacked list below `md`: the one `app-work-list` outside the agents' sections. */
  const stackedList = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>('app-work-list')].filter(
      (list) => !list.closest('section'),
    );

  const BOARD_EPICS = [
    'Ready for dev epic',
    'Implementing epic',
    'Implemented epic',
    'Verifying epic',
    'Started epic',
  ];
  const BOARD_TICKETS = [
    'Ready for dev ticket',
    'Implementing ticket',
    'Implemented ticket',
    'Verifying ticket',
  ];

  /** The epic boards view: each board epic on its own board, then one board of the tickets. */
  function expectEpicBoards(element: HTMLElement) {
    expect(epicBoards(element)).toEqual(BOARD_EPICS);
    const boards = element.querySelectorAll<HTMLElement>('app-kanban-board');
    expect(boards).toHaveLength(1);
    const [rest] = boards;
    for (const title of BOARD_TICKETS) expect(rest.textContent).toContain(title);
    for (const title of BOARD_EPICS) expect(rest.textContent).not.toContain(title);
  }

  /** The inline view: one board of everything, no epic board. */
  function expectInline(element: HTMLElement) {
    expect(epicBoards(element)).toEqual([]);
    const boards = element.querySelectorAll<HTMLElement>('app-kanban-board');
    expect(boards).toHaveLength(1);
    for (const title of [...BOARD_EPICS, ...BOARD_TICKETS]) {
      expect(boards[0].textContent).toContain(title);
    }
  }

  it('shows agent work before the board, on it, and after it, by its status', async () => {
    const element = await shown([
      'Reported ticket',
      'Refined epic',
      'Implementing ticket',
      'Verified ticket',
      'Dropped epic',
    ]);
    const before = section(element, 'Agents on earlier work');
    const after = section(element, 'Agents on later work');
    expect(before.className).not.toContain('hidden');
    expect(after.className).not.toContain('hidden');
    expect(before.textContent).toContain('Reported ticket');
    expect(before.textContent).toContain('Refined epic');
    expect(before.textContent).not.toContain('Reported epic');
    expect(after.textContent).toContain('Verified ticket');
    expect(after.textContent).toContain('Dropped epic');
    expect(after.textContent).not.toContain('Done ticket');
    // Work on a board status is on the board, once, as before.
    const board = element.querySelector<HTMLElement>('app-kanban-board')!;
    expect(board.textContent?.match(/Implementing ticket/g)).toHaveLength(1);
    expect(before.textContent).not.toContain('Implementing ticket');
    expect(after.textContent).not.toContain('Implementing ticket');
  });

  // qits-2051: by default each epic on the board has its own epic board, its whole subtree, and the
  // rest (the tickets here) share one board below them.
  it('draws each board epic on its own epic board by default, then one board for the rest', async () => {
    const element = await shown([]);
    expectEpicBoards(element);
    const started = [...element.querySelectorAll('app-epic-board')].find((board) =>
      board.textContent?.includes('Started epic'),
    )!;
    expect(started.textContent).toContain('Started feature');
    expect(started.textContent).toContain('Started task');
    // With its bar: the page does not name the epic.
    expect(started.querySelector('header')).not.toBeNull();
    // Both from md up, switched by class, so a server render hydrates as is.
    expect(started.parentElement!.className.split(' ').sort()).toEqual([
      'flex-col',
      'gap-12',
      'hidden',
      'md:flex',
    ]);
  });

  it('stacks the epic boards’ epics first below md, then the rest', async () => {
    const element = await shown([]);
    const lists = stackedList(element);
    expect(lists).toHaveLength(1);
    const [stacked] = lists;
    expect(stacked.parentElement!.className).toBe('md:hidden');
    const text = stacked.textContent ?? '';
    const at = (title: string) => text.indexOf(title);
    for (const title of [...BOARD_EPICS, ...BOARD_TICKETS]) expect(at(title)).toBeGreaterThan(-1);
    const lastEpic = Math.max(...BOARD_EPICS.map(at));
    for (const title of BOARD_TICKETS) expect(at(title)).toBeGreaterThan(lastEpic);
    expect(text).toContain('Started task');
    expect(text).not.toContain('Reported ticket');
  });

  it('draws the one inline board when that view is stored', async () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'inline');
    expectInline(await shown([]));
  });

  it('draws the epic boards when the stored view is unknown', async () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'swimlanes');
    expectEpicBoards(await shown([]));
  });

  it('draws the epic boards when the storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expectEpicBoards(await shown([]));
  });

  // The board's columns do not fit a phone: below md the same tree is drawn stacked (qits-1861).
  // Both are rendered, and the breakpoint picks one by class, so a server render hydrates as is.
  it('draws the inline board from md up, and the same work stacked below it', async () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'inline');
    const element = await shown([]);
    const board = element.querySelector<HTMLElement>('app-kanban-board')!;
    expect(board.parentElement!.className.split(' ').sort()).toEqual(['hidden', 'md:block']);
    const lists = stackedList(element);
    expect(lists).toHaveLength(1);
    const [stacked] = lists;
    expect(stacked.parentElement!.className).toBe('md:hidden');
    for (const title of [
      'Ready for dev epic',
      'Ready for dev ticket',
      'Implementing ticket',
      'Verifying epic',
      'Started feature',
      'Started task',
    ]) {
      expect(stacked.textContent).toContain(title);
      expect(board.textContent).toContain(title);
    }
    expect(stacked.textContent).not.toContain('Reported ticket');
    expect(stacked.textContent).not.toContain('Verified ticket');
    // Each top-level item with its own status, as the board's column would say.
    const ticket = [...stacked.querySelectorAll('app-ticket-list-item')].find((item) =>
      item.textContent?.includes('Implementing ticket'),
    )!;
    expect([...ticket.querySelectorAll('ui-tag')].map((t) => t.textContent?.trim())).toContain(
      'implementing',
    );
  });

  it('shows no agent section when no agent is on this project’s work', async () => {
    const element = await shown([]);
    expect(section(element, 'Agents on earlier work').className).toContain('hidden');
    expect(section(element, 'Agents on later work').className).toContain('hidden');
  });
});
