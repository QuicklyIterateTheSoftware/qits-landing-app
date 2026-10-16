import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, Subject } from 'rxjs';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../../../api/workspaces/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { AgentsStore } from '$core/workspaces/agents.store';
import { SLOT_EVENTS } from '$core/workspaces/workspace-events';
import { workspacesGoldenMaster } from '../../../../../../testing/golden-masters';
import { WorkspaceRunnersPage } from './workspace-runners.page';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const IN_SERVICE = 'a runner in service';
const SLOTS = 'a project with workspace slots hosting agents';
const ROTATED = 'an unregistered runner';
const WRAPPER = 'wrapper-repository';
// qits-workspaces' slots of "a project with workspace slots hosting agents": one, on `localhost`,
// the runner "a runner in service" lists.
const PROJECT_SLOTS = workspacesGoldenMaster(SLOTS, 'listWorkspaces').entries.map(
  (e: { workspace: unknown }) => e.workspace,
);

describe('WorkspaceRunnersPage', () => {
  let http: HttpTestingController;
  let loadProject: ReturnType<typeof vi.fn>;
  let follow: ReturnType<typeof vi.fn>;
  let events: Subject<DomainEvent>;

  function configure(platform: 'browser' | 'server') {
    loadProject = vi.fn();
    follow = vi.fn();
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
        { provide: PLATFORM_ID, useValue: platform },
        provideRouter([
          { path: 'projects/:slug/workspaces/runners', component: WorkspaceRunnersPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        {
          provide: SelectedProject,
          useValue: { slug: signal('qits'), project: signal({ id: 'project-1', slug: 'qits' }) },
        },
        {
          provide: RepositoriesStore,
          useValue: {
            load: vi.fn(),
            byProject: signal({ 'project-1': { wrapper: { repositoryId: WRAPPER } } }),
          },
        },
        {
          provide: AgentsStore,
          useValue: {
            loadProject,
            follow,
            projectOf: (id: string) =>
              id === WRAPPER ? { status: 'loaded', slots: PROJECT_SLOTS, agents: [] } : undefined,
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/qits/workspaces/runners');
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    const button = (label: string) =>
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
    return { harness, element, text, button };
  }

  async function answerRunners(harness: RouterTestingHarness) {
    http
      .expectOne('/workspaces/api/runners')
      .flush(workspacesGoldenMaster(IN_SERVICE, 'listRunners'));
    await settle();
    harness.fixture.detectChanges();
  }

  it('lists the runners, with this project’s slots on each', async () => {
    configure('browser');
    const { harness, element, text } = await open();
    await answerRunners(harness);
    expect(text()).toContain('localhost');
    expect(text()).toContain('connected');
    expect(text()).toContain('0/1 slots running');
    expect(text()).toContain('health check passed');
    expect(loadProject).toHaveBeenCalledWith(WRAPPER, 'qits');
    const slot = element.querySelector('section[aria-label="Slots"] a');
    expect(slot?.getAttribute('href')).toBe(`/projects/qits/workspaces/${PROJECT_SLOTS[0].id}`);
    expect(element.querySelector('h2#register-runner')).not.toBeNull();
    expect(
      Array.from(element.querySelectorAll('a'))
        .find((a) => a.textContent?.includes('Back'))
        ?.getAttribute('href'),
    ).toBe('/projects/qits/workspaces');
  });

  /** Sends `sent` as one burst, and lets it settle. */
  async function burst(...sent: DomainEvent[]) {
    vi.useFakeTimers();
    sent.forEach((event) => events.next(event));
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
  }

  const runnerId = () => workspacesGoldenMaster(IN_SERVICE, 'listRunners')[0].id as string;

  it('reads the runners again after a runner event naming one of them, never on a timer', async () => {
    configure('browser');
    const { harness } = await open();
    await answerRunners(harness);
    await burst({
      name: 'RunnerDisconnected',
      payload: JSON.stringify({ runnerId: runnerId(), runnerName: 'localhost' }),
    });
    await answerRunners(harness);
    // qits-ci's runners are not these: their events read nothing.
    await burst({
      name: 'RunnerConnected',
      payload: JSON.stringify({ runnerId: 'a-qits-ci-runner', runnerName: 'workstation' }),
    });
    http.expectNone('/workspaces/api/runners');
  });

  it('reads the runners again after a slot event (the counts)', async () => {
    configure('browser');
    const { harness } = await open();
    await answerRunners(harness);
    await burst({ name: 'WorkspaceRemoved', payload: JSON.stringify({ workspaceId: '7' }) });
    await answerRunners(harness);
  });

  it('reads the project’s slots again after a slot event about its wrapper', async () => {
    configure('browser');
    const { harness } = await open();
    await answerRunners(harness);
    expect(follow).toHaveBeenCalledTimes(1);
    const [, scope, refresh, names] = follow.mock.calls[0];
    expect(names).toEqual(SLOT_EVENTS);
    expect(scope()).toEqual({ repositoryId: WRAPPER });
    loadProject.mockClear();
    refresh([]);
    expect(loadProject).toHaveBeenCalledWith(WRAPPER, 'qits');
  });

  it('shows a rotated token’s install line once, and drops it on Close', async () => {
    configure('browser');
    const { harness, text, button } = await open();
    await answerRunners(harness);
    button('Actions')!.click();
    harness.fixture.detectChanges();
    button('Rotate token')!.click();
    await settle();
    const rotated = workspacesGoldenMaster(ROTATED, 'rotateRunnerRegistrationToken');
    http
      .expectOne((r) => r.url.endsWith('/registration-token'))
      .flush(rotated, { status: 200, statusText: 'OK' });
    await settle();
    await answerRunners(harness);
    expect(text()).toContain(rotated.installLine);
    expect(text()).toContain('This is the only time it is shown');
    button('Close')!.click();
    harness.fixture.detectChanges();
    expect(text()).not.toContain(rotated.installLine);
  });

  it('says the runners could not be read', async () => {
    configure('browser');
    const { harness, element } = await open();
    http.expectOne('/workspaces/api/runners').flush(null, { status: 403, statusText: 'Forbidden' });
    await settle();
    harness.fixture.detectChanges();
    const failed = element.querySelector('ui-spinner svg[aria-label="Failed to load"]');
    expect(failed?.parentElement?.classList.contains('hidden')).toBe(false);
    expect(element.querySelector('[aria-label="Runner localhost"]')).toBeNull();
  });

  it('reads nothing on the server', async () => {
    configure('server');
    await open();
    expect(loadProject).not.toHaveBeenCalled();
  });
});
