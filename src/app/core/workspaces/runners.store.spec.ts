import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { RunnersStore, type NewRunner, type RunnerChange } from './runners.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IN_SERVICE = 'a runner in service';
const CONNECTED = 'a connected runner';
const UNREGISTERED = 'an unregistered runner';
const QUARANTINED = 'a quarantined runner';
const NO_RUNNERS = 'no runners';
const OWNS = 'a workspace slot hosting agents';

const op = (state: string, operationId: string) =>
  workspacesGoldenMasters.operation(state, operationId);
const ID = op(IN_SERVICE, 'listRunners').params['runnerId'];
const RUNNER = `/workspaces/api/runners/${ID}`;

/** `RunnersStore` on qits-workspaces' recorded runner states (epic qits-1230). */
describe('RunnersStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof RunnersStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(RunnersStore);
  });

  afterEach(() => http.verify());

  it('reads the runners, sorted by name', async () => {
    const done = store.load();
    expect(store.status()).toBe('loading');
    await settle();
    // Two recorded runners under two names, to show the order: "a connected runner"'s renamed
    // `zeta` ahead of "a runner in service"'s `localhost`.
    const [connected] = workspacesGoldenMaster(CONNECTED, 'listRunners');
    const [inService] = workspacesGoldenMaster(IN_SERVICE, 'listRunners');
    http.expectOne('/workspaces/api/runners').flush([{ ...connected, name: 'zeta' }, inService]);
    await done;
    expect(store.status()).toBe('loaded');
    expect(store.runners().map((r) => r.name)).toEqual(['localhost', 'zeta']);
  });

  it('keeps the last good list when a read again fails', async () => {
    const first = store.load();
    await settle();
    http
      .expectOne('/workspaces/api/runners')
      .flush(workspacesGoldenMaster(IN_SERVICE, 'listRunners'));
    await first;
    const again = store.load();
    expect(store.status()).toBe('loaded');
    await settle();
    http
      .expectOne('/workspaces/api/runners')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    await again;
    expect(store.status()).toBe('loaded');
    expect(store.runners().length).toBe(1);
  });

  it('says when the first read fails', async () => {
    const done = store.load();
    await settle();
    http.expectOne('/workspaces/api/runners').flush(null, { status: 403, statusText: 'Forbidden' });
    await done;
    expect(store.status()).toBe('error');
  });

  it('reads a runner’s node details once, and again when asked', async () => {
    const done = store.loadHealth(ID);
    expect(store.healthOf(ID)?.status).toBe('loading');
    await settle();
    http.expectOne(`${RUNNER}/health`).flush(workspacesGoldenMaster(IN_SERVICE, 'getRunnerHealth'));
    await done;
    expect(store.healthOf(ID)?.status).toBe('loaded');
    expect(store.healthOf(ID)?.checks.map((c) => c.name)).toEqual(['docker', 'selfTest']);
    await store.loadHealth(ID);
    const again = store.loadHealth(ID, true);
    expect(store.healthOf(ID)?.status).toBe('loaded');
    await settle();
    http.expectOne(`${RUNNER}/health`).flush(workspacesGoldenMaster(IN_SERVICE, 'getRunnerHealth'));
    await again;
  });

  it('says a runner never checked has no node details (204)', async () => {
    const id = op(UNREGISTERED, 'getRunnerHealth').params['runnerId'];
    const done = store.loadHealth(id);
    await settle();
    http
      .expectOne(`/workspaces/api/runners/${id}/health`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(store.healthOf(id)).toEqual({ status: 'none', checks: [] });
  });

  it('registers a runner and hands back its install line', async () => {
    const body = op(NO_RUNNERS, 'createRunner').body as unknown as NewRunner;
    const done = store.createRunner(body);
    await settle();
    const request = http.expectOne('/workspaces/api/runners');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    const answer = workspacesGoldenMaster(NO_RUNNERS, 'createRunner');
    request.flush(answer, { status: 201, statusText: 'Created' });
    expect(await done).toMatchObject({
      ok: true,
      value: { installLine: answer.installLine, registrationToken: answer.registrationToken },
    });
  });

  it('rotates a runner’s token', async () => {
    const id = op(UNREGISTERED, 'rotateRunnerRegistrationToken').params['runnerId'];
    const done = store.rotateToken(id);
    await settle();
    const request = http.expectOne(`/workspaces/api/runners/${id}/registration-token`);
    expect(request.request.method).toBe('POST');
    request.flush(workspacesGoldenMaster(UNREGISTERED, 'rotateRunnerRegistrationToken'));
    expect(await done).toMatchObject({ ok: true });
  });

  it('saves a runner’s slots, description and memory caps', async () => {
    const change = op(IN_SERVICE, 'patchRunner').body as unknown as RunnerChange;
    const done = store.patchRunner(ID, change);
    await settle();
    const request = http.expectOne(RUNNER);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(change);
    request.flush(workspacesGoldenMaster(IN_SERVICE, 'patchRunner'));
    expect(await done).toMatchObject({ ok: true, value: { slots: 2 } });
  });

  it('lifts a runner’s quarantine', async () => {
    const id = op(QUARANTINED, 'greenlightRunner').params['runnerId'];
    const done = store.greenlight(id);
    await settle();
    const request = http.expectOne(`/workspaces/api/runners/${id}/greenlight`);
    expect(request.request.method).toBe('POST');
    request.flush(workspacesGoldenMaster(QUARANTINED, 'greenlightRunner'));
    expect(await done).toMatchObject({ ok: true, value: { quarantined: false } });
  });

  for (const [verb, path, operationId] of [
    ['requestHealthcheck', 'healthcheck', 'requestRunnerHealthcheck'],
    ['requestLoginCheck', 'login-check', 'requestRunnerLoginCheck'],
  ] as const) {
    it(`${verb}: queued (202), or refused with the service’s reason`, async () => {
      const queued = store[verb](ID);
      await settle();
      http.expectOne(`${RUNNER}/${path}`).flush(null, { status: 202, statusText: 'Accepted' });
      expect(await queued).toEqual({ ok: true, value: undefined });

      const id = op(UNREGISTERED, operationId).params['runnerId'];
      const refused = store[verb](id);
      await settle();
      const body = workspacesGoldenMaster(UNREGISTERED, operationId);
      http
        .expectOne(`/workspaces/api/runners/${id}/${path}`)
        .flush(body, { status: 409, statusText: 'Conflict' });
      expect(await refused).toEqual({
        ok: false,
        status: 409,
        message: body.message,
        code: 'RUNNER_UNAVAILABLE',
      });
    });
  }

  it('deletes a runner (204)', async () => {
    const id = op(UNREGISTERED, 'deleteRunner').params['runnerId'];
    const done = store.deleteRunner(id);
    await settle();
    const request = http.expectOne(`/workspaces/api/runners/${id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(await done).toEqual({ ok: true });
  });

  it('hands a refused delete back with the workspaces the runner owns', async () => {
    const id = op(OWNS, 'deleteRunner').params['runnerId'];
    const done = store.deleteRunner(id);
    await settle();
    const body = workspacesGoldenMaster(OWNS, 'deleteRunner');
    http
      .expectOne(`/workspaces/api/runners/${id}`)
      .flush(body, { status: 409, statusText: 'Conflict' });
    expect(await done).toEqual({
      ok: false,
      status: 409,
      message: body.message,
      code: 'RUNNER_OWNS_WORKSPACES',
      workspaceIds: [1],
    });
  });

  it('says a delete got no answer', async () => {
    const done = store.deleteRunner(ID);
    await settle();
    http.expectOne(RUNNER).error(new ProgressEvent('error'));
    expect(await done).toMatchObject({ ok: false, status: 0 });
  });
});
