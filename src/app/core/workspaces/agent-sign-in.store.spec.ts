import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspaceDaemonClient } from '../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../api/workspace-daemon/client/client.gen';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
} from '../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { AgentSignInStore, signedOutHarness } from './agent-sign-in.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';
const ORIGIN = 'https://workspaces.qits.example';
const ROW = Number(
  workspaceDaemonGoldenMasters.operation(SIGNED_OUT, 'availableAgents').params['workspaceRowId'],
);
const BASE = `${ORIGIN}/workspaces/container/${ROW}`;

describe('signedOutHarness', () => {
  const report = (state: string) =>
    workspaceDaemonGoldenMaster(state, 'availableAgents').capabilities;

  it('names the harness nobody signed in, with the daemon’s hint', () => {
    const out = signedOutHarness(report(SIGNED_OUT), 'CLAUDE');
    expect(out?.harness).toBe('CLAUDE');
    expect(out?.message).toBe(
      'Nobody has signed Claude Code in on the shared credential volume, so the agent cannot ' +
        `start. ${report(SIGNED_OUT)[0].authDetail}`,
    );
  });

  it('says nothing for a signed-in harness, or one the report does not hold', () => {
    expect(signedOutHarness(report(SIGNED_IN), 'CLAUDE')).toBeNull();
    expect(signedOutHarness(report(SIGNED_OUT), 'KIMI')).toBeNull();
  });

  it('takes any harness when the agent’s is not known', () => {
    expect(signedOutHarness(report(SIGNED_OUT), null)?.harness).toBe('CLAUDE');
  });
});

/** `AgentSignInStore` on qits-workspace-daemon's recorded states (epic qits-1230). */
describe('AgentSignInStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentSignInStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AgentSignInStore);
  });

  afterEach(() => http.verify());

  it('reads the harness report from the slot’s daemon', async () => {
    const done = store.loadReport(ROW);
    expect(store.signInOf(ROW)?.status).toBe('loading');
    await settle();
    const answer = workspaceDaemonGoldenMaster(SIGNED_OUT, 'availableAgents');
    http.expectOne(`${BASE}/agents/available`).flush(answer);
    await done;
    expect(store.signInOf(ROW)).toMatchObject({
      status: 'loaded',
      capabilities: answer.capabilities,
    });
  });

  it('keeps the last good report when a read again fails, and shows none before', async () => {
    let done = store.loadReport(ROW);
    await settle();
    http.expectOne(`${BASE}/agents/available`).flush(null, { status: 502, statusText: 'Bad' });
    await done;
    expect(store.signInOf(ROW)).toMatchObject({ status: 'error', capabilities: [] });
    done = store.loadReport(ROW);
    await settle();
    const answer = workspaceDaemonGoldenMaster(SIGNED_IN, 'availableAgents');
    http.expectOne(`${BASE}/agents/available`).flush(answer);
    await done;
    done = store.loadReport(ROW);
    await settle();
    http.expectOne(`${BASE}/agents/available`).flush(null, { status: 502, statusText: 'Bad' });
    await done;
    expect(store.signInOf(ROW)).toMatchObject({
      status: 'loaded',
      capabilities: answer.capabilities,
    });
  });

  it('opens the sign-in terminal once, for the harness', async () => {
    const done = store.open(ROW, 'CLAUDE');
    expect(store.signInOf(ROW)?.opening).toBe(true);
    await settle();
    const request = http.expectOne(`${BASE}/agents/sign-in`);
    expect(request.request.body).toEqual({ agentType: 'CLAUDE' });
    const answer = workspaceDaemonGoldenMaster(SIGNED_OUT, 'openSignInTerminal');
    request.flush(answer);
    await done;
    expect(store.signInOf(ROW)).toMatchObject({ opening: false, commandId: answer.command.id });
    await store.open(ROW, 'CLAUDE');
    http.expectNone(`${BASE}/agents/sign-in`);
  });

  it('says why the terminal did not open', async () => {
    const done = store.open(ROW, 'CLAUDE');
    await settle();
    // No refusal of the sign-in is recorded; an error answer is only a status and its message.
    http
      .expectOne(`${BASE}/agents/sign-in`)
      .flush({ message: 'Coding agents are not wired yet.' }, { status: 503, statusText: 'No' });
    await done;
    expect(store.signInOf(ROW)).toMatchObject({
      commandId: null,
      problem: 'The sign-in terminal did not open — 503 Coding agents are not wired yet.',
    });
  });

  it('drops a finished terminal and reads the report again', async () => {
    const opened = store.open(ROW, 'CLAUDE');
    await settle();
    http
      .expectOne(`${BASE}/agents/sign-in`)
      .flush(workspaceDaemonGoldenMaster(SIGNED_OUT, 'openSignInTerminal'));
    await opened;
    const done = store.finished(ROW);
    expect(store.signInOf(ROW)?.commandId).toBeNull();
    await settle();
    http
      .expectOne(`${BASE}/agents/available`)
      .flush(workspaceDaemonGoldenMaster(SIGNED_IN, 'availableAgents'));
    await done;
    expect(signedOutHarness(store.signInOf(ROW)!.capabilities, 'CLAUDE')).toBeNull();
  });
});
