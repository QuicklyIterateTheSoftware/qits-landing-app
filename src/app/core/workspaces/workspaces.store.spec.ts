import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { WorkspacesStore } from './workspaces.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const BOUND = 'a project with workspaces bound to work items';
const NONE = 'a work item with no workspaces';
const OPEN = '/workspaces/api/work/workspaces';

const params = (state: string, operationId: string) =>
  workspacesGoldenMasters.operation(state, operationId).params;

/** `WorkspacesStore` on qits-workspaces' recorded states. */
describe('WorkspacesStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof WorkspacesStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(WorkspacesStore);
  });

  afterEach(() => http.verify());

  async function answerOpen(body: object | null, init?: { status: number; statusText: string }) {
    const done = store.status() === 'loaded' ? store.refresh() : store.load();
    await settle();
    http.expectOne(OPEN).flush(body, init);
    await done;
  }

  it('knows which items have an active workspace', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    const p = params(BOUND, 'listOpenWorkspaces');
    expect(store.status()).toBe('loaded');
    for (const id of [p['epicId'], p['featureId'], p['taskId'], p['bugTicketId']]) {
      expect(store.hasOpen(id)).toBe(true);
    }
    expect(store.hasOpen(p['improvementTicketId'])).toBe(false);
    expect(store.hasOpen(undefined)).toBe(false);
  });

  it('loads once', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    await store.load();
    await settle();
    http.expectNone(OPEN);
  });

  it('keeps the last good answer when a refresh fails', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    await answerOpen(null, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('loaded');
    expect(store.hasOpen(params(BOUND, 'listOpenWorkspaces')['bugTicketId'])).toBe(true);
  });

  it('fails a first load, and loads again after it', async () => {
    await answerOpen(null, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('error');
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    expect(store.status()).toBe('loaded');
  });

  it('reads an item’s workspaces in every state, newest first', async () => {
    const ref = params(BOUND, 'listWorkItemWorkspaces')['bugTicketId'];
    const done = store.loadHistory(ref);
    expect(store.historyOf(ref)?.status).toBe('loading');
    await settle();
    http
      .expectOne(`/workspaces/api/work/${ref}/workspaces`)
      .flush(workspacesGoldenMaster(BOUND, 'listWorkItemWorkspaces'));
    await done;
    const history = store.historyOf(ref)!;
    expect(history.status).toBe('loaded');
    expect(history.entries.map((w) => w.status)).toEqual(['ACTIVE', 'INTEGRATED', 'ABANDONED']);
  });

  it('reads an item without workspaces, and an error', async () => {
    const ref = params(NONE, 'listWorkItemWorkspaces')['improvementTicketId'];
    const empty = store.loadHistory(ref);
    const failed = store.loadHistory('contract-404');
    await settle();
    http
      .expectOne(`/workspaces/api/work/${ref}/workspaces`)
      .flush(workspacesGoldenMaster(NONE, 'listWorkItemWorkspaces'));
    http
      .expectOne('/workspaces/api/work/contract-404/workspaces')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await Promise.all([empty, failed]);
    expect(store.historyOf(ref)).toEqual({ status: 'loaded', entries: [] });
    expect(store.historyOf('contract-404')).toEqual({ status: 'error', entries: [] });
  });
});
