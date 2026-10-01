import { DOCUMENT } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { client as projectsClient } from '../app/api/projects/client.gen';
import { provideHeyApiClient } from '../app/api/projects/client/client.gen';
import { sessionGuard } from '../app/auth/session.guard';
import { ProjectsStore } from '../app/core/projects/projects.store';
import type { InteractionSlug } from '../app/interactions';
import { ProjectCard } from '../app/projects/project-card';
import {
  assertPactFile,
  examplePath,
  goldenMaster,
  goldenOperation,
  interaction,
  type PactInteraction,
} from './golden-masters';

/**
 * qits-landing's pact with qits-projects (epic qits-546): one test per (UI interaction, call).
 *
 * Each test drives the real code (the guard, the store, the card), asserts the request it makes
 * with `expectOne`, answers it with qits-projects' golden master, and asserts what the app does
 * with the answer. Only then does it record the interaction. `afterAll` writes
 * `pacts/qits-landing-qits-projects.json` from what was recorded, and fails when the committed file
 * differs (`QITS_GOLDEN_UPDATE=true npm test` rewrites it).
 *
 * A new call or a new UI interaction is a row in PAIRS and a test that records it.
 */
const PAIRS: readonly (readonly [InteractionSlug, string, string])[] = [
  ['sign-in-landing', 'a project exists', 'listProjects'],
  ['list-projects', 'a project exists', 'listProjects'],
  ['open-project', 'a project exists', 'getProject'],
  ['open-project', 'no project with the given id', 'getProject'],
  ['show-project-repositories', 'a project with 3 repositories', 'listProjectRepositories'],
];

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const recorded: PactInteraction[] = [];

describe('qits-landing → qits-projects pact', () => {
  // Injected on first use, not in beforeEach: the guard's test overrides DOCUMENT first.
  const http = () => TestBed.inject(HttpTestingController);
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
  });

  afterEach(() => http().verify());

  afterAll(() => {
    const missing = PAIRS.filter(
      ([trigger, state, operationId]) =>
        !recorded.some(
          (i) =>
            i.state === state &&
            i.description === interaction(state, operationId, trigger).description,
        ),
    );
    if (missing.length) {
      // A failed or skipped test: a partial pact must be neither compared nor written.
      throw new Error(`not every pair recorded its interaction: ${JSON.stringify(missing)}`);
    }
    assertPactFile(recorded);
  });

  /** Asserts the one request for (state, operation) and answers it with the golden master. */
  function answer(state: string, operationId: string): void {
    const op = goldenOperation(state, operationId);
    http()
      .expectOne({ method: op.method, url: examplePath(op) })
      .flush(goldenMaster(state, operationId), {
        status: op.status,
        statusText: op.status === 200 ? 'OK' : 'Not Found',
      });
  }

  function record(trigger: InteractionSlug, state: string, operationId: string): void {
    recorded.push(interaction(state, operationId, trigger));
  }

  it('sign-in-landing: the guard lets a visitor with a session through', async () => {
    TestBed.overrideProvider(DOCUMENT, { useValue: { location: { assign } } });
    const passed = TestBed.runInInjectionContext(() =>
      sessionGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot),
    );
    await settle();
    answer('a project exists', 'listProjects');
    expect(await passed).toBe(true);
    expect(assign).not.toHaveBeenCalled();
    record('sign-in-landing', 'a project exists', 'listProjects');
  });

  it('list-projects: the store loads the list on init', async () => {
    const store = TestBed.inject(ProjectsStore);
    await settle();
    answer('a project exists', 'listProjects');
    await settle();
    const list = goldenMaster('a project exists', 'listProjects');
    expect(store.status()).toBe('loaded');
    expect(store.ids()).toEqual(list.entries.map((e: { project: { id: string } }) => e.project.id));
    record('list-projects', 'a project exists', 'listProjects');
  });

  /** A store whose list does not hold the project, so `refresh(id)` has to fetch it. */
  async function storeWithoutTheProject() {
    const store = TestBed.inject(ProjectsStore);
    await settle();
    const list = goldenMaster('a project exists', 'listProjects');
    http()
      .expectOne('/projects/api/projects')
      .flush({ ...list, entries: [] });
    await settle();
    return store;
  }

  it('open-project: the store fetches a project it does not hold', async () => {
    const store = await storeWithoutTheProject();
    const op = goldenOperation('a project exists', 'getProject');
    const done = store.refresh(op.params['projectId']);
    await settle();
    answer('a project exists', 'getProject');
    await done;
    const detail = goldenMaster('a project exists', 'getProject');
    expect(store.selected()?.id).toBe(detail.project.id);
    expect(store.selected()?.name).toBe(detail.project.name);
    record('open-project', 'a project exists', 'getProject');
  });

  it('open-project: a project qits-projects does not know stays selected and unloaded', async () => {
    const store = await storeWithoutTheProject();
    const op = goldenOperation('no project with the given id', 'getProject');
    const done = store.refresh(op.params['projectId']);
    await settle();
    answer('no project with the given id', 'getProject');
    await done;
    expect(store.selectedId()).toBe(op.params['projectId']);
    expect(store.selected()).toBeUndefined();
    expect(store.ids()).toEqual([]);
    record('open-project', 'no project with the given id', 'getProject');
  });

  it('show-project-repositories: a card counts the project’s repositories', async () => {
    const op = goldenOperation('a project with 3 repositories', 'listProjectRepositories');
    const project = goldenMaster('a project exists', 'getProject').project;
    const fixture = TestBed.createComponent(ProjectCard);
    fixture.componentRef.setInput('project', { ...project, id: op.params['projectId'] });
    fixture.detectChanges();
    await settle();
    TestBed.tick();
    answer('a project with 3 repositories', 'listProjectRepositories');
    await fixture.whenStable();
    const repositories = goldenMaster('a project with 3 repositories', 'listProjectRepositories');
    const body = (fixture.nativeElement as HTMLElement).querySelector('card-body');
    expect(body?.textContent?.trim()).toBe(`${repositories.entries.length} components`);
    record('show-project-repositories', 'a project with 3 repositories', 'listProjectRepositories');
  });

  it('interaction: omits the path generator for a parameterless path, keeps it for a parameterised one', () => {
    const request = (i: PactInteraction) =>
      (i.json as Record<string, Record<string, unknown>>)['request'];

    const listed = interaction('a project exists', 'listProjects', 'list-projects');
    expect(request(listed)['generators']).toBeUndefined();

    const fetched = interaction('a project exists', 'getProject', 'open-project');
    expect(request(fetched)['generators']).toEqual({
      path: {
        type: 'ProviderState',
        expression: expect.stringContaining('${projectId}'),
        dataType: 'RAW',
      },
    });
  });
});
