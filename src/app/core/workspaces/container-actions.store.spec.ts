import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { ContainerActionsStore } from './container-actions.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const STOPPED = 'a stopped workspace slot';
const RUNNING = 'a workspace slot running on a target';
const OFFLINE = 'a workspace slot qits-system cannot be asked about';

const op = (state: string, operationId: string) =>
  workspacesGoldenMasters.operation(state, operationId);

/** `ContainerActionsStore` on qits-workspaces' recorded states (epic qits-1230). */
describe('ContainerActionsStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof ContainerActionsStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ContainerActionsStore);
  });

  afterEach(() => http.verify());

  it('starts a stopped slot’s container', async () => {
    const id = op(STOPPED, 'ensureWorkspaceContainer').params['workspaceId'];
    const done = store.ensureContainer(Number(id));
    await settle();
    const answer = workspacesGoldenMaster(STOPPED, 'ensureWorkspaceContainer');
    http.expectOne(`/workspaces/api/workspaces/${id}/ensure-container`).flush(answer);
    expect(await done).toMatchObject({
      ok: true,
      value: { technicalProcessId: answer.technicalProcessId },
    });
  });

  it('says why a start qits-system could not be asked about was refused', async () => {
    const id = op(OFFLINE, 'ensureWorkspaceContainer').params['workspaceId'];
    const done = store.ensureContainer(Number(id));
    await settle();
    const body = workspacesGoldenMaster(OFFLINE, 'ensureWorkspaceContainer');
    http
      .expectOne(`/workspaces/api/workspaces/${id}/ensure-container`)
      .flush(body, { status: 409, statusText: 'Conflict' });
    expect(await done).toEqual({
      ok: false,
      status: 409,
      message: body.message,
      code: 'TARGET_UNAVAILABLE',
    });
  });

  it('stops a running slot’s container', async () => {
    const id = op(RUNNING, 'stopWorkspaceContainer').params['workspaceId'];
    const done = store.stopContainer(Number(id));
    await settle();
    http
      .expectOne(`/workspaces/api/workspaces/${id}/stop-container`)
      .flush(workspacesGoldenMaster(RUNNING, 'stopWorkspaceContainer'));
    expect(await done).toMatchObject({ ok: true, value: { runtimeStatus: 'STOPPED' } });
  });

  it('says why a stop qits-system could not be asked about was refused', async () => {
    const id = op(OFFLINE, 'stopWorkspaceContainer').params['workspaceId'];
    const done = store.stopContainer(Number(id));
    await settle();
    const body = workspacesGoldenMaster(OFFLINE, 'stopWorkspaceContainer');
    http
      .expectOne(`/workspaces/api/workspaces/${id}/stop-container`)
      .flush(body, { status: 409, statusText: 'Conflict' });
    expect(await done).toMatchObject({ ok: false, status: 409, message: body.message });
  });

  it('recreates a slot’s container', async () => {
    const id = op(STOPPED, 'ensureWorkspaceContainer').params['workspaceId'];
    const done = store.recreateContainer(Number(id));
    await settle();
    // No successful recreate is recorded: the answer is the recorded start of a stopped slot,
    // which has the recreate's shape (the slot and the start's process).
    const answer = workspacesGoldenMaster(STOPPED, 'ensureWorkspaceContainer');
    http.expectOne(`/workspaces/api/workspaces/${id}/recreate-container`).flush(answer);
    expect(await done).toMatchObject({
      ok: true,
      value: { technicalProcessId: answer.technicalProcessId },
    });
  });

  it('says why a recreate was refused', async () => {
    const id = op(UNREACHABLE, 'recreateWorkspaceContainer').params['workspaceId'];
    const done = store.recreateContainer(Number(id));
    await settle();
    const body = workspacesGoldenMaster(UNREACHABLE, 'recreateWorkspaceContainer');
    http
      .expectOne(`/workspaces/api/workspaces/${id}/recreate-container`)
      .flush(body, { status: 400, statusText: 'Bad Request' });
    expect(await done).toEqual({
      ok: false,
      status: 400,
      message: body.message,
      code: body.code,
    });
  });
});
