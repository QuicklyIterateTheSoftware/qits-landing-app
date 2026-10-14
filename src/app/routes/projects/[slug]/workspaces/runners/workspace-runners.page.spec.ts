import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../../../api/workspaces/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { AgentsStore } from '$core/workspaces/agents.store';
import { workspacesGoldenMaster } from '../../../../../../testing/golden-masters';
import { RUNNERS_POLL_MS, WorkspaceRunnersPage } from './workspace-runners.page';

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

  function configure(platform: 'browser' | 'server') {
    loadProject = vi.fn();
    TestBed.configureTestingModule({
      providers: [
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

  it('reads the runners again every 5 s while the page is visible, and not while hidden', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    configure('browser');
    const { harness } = await open();
    await answerRunners(harness);
    vi.advanceTimersByTime(RUNNERS_POLL_MS);
    await settle();
    await answerRunners(harness);

    const document = TestBed.inject(DOCUMENT);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(RUNNERS_POLL_MS * 3);
    await settle();
    http.expectNone('/workspaces/api/runners');

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    await answerRunners(harness);
    delete (document as { hidden?: boolean }).hidden;
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
