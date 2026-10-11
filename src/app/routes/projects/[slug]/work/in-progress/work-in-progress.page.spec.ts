import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
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
 * copied once per item it is put on (`agentsOn`).
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

  afterEach(() => http.verify());

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

  it('shows no agent section when no agent is on this project’s work', async () => {
    const element = await shown([]);
    expect(section(element, 'Agents on earlier work').className).toContain('hidden');
    expect(section(element, 'Agents on later work').className).toContain('hidden');
  });
});
