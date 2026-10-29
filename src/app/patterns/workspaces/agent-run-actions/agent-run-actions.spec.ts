import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import { workspacesGoldenMaster } from '../../../../testing/golden-masters';
import { AgentRunActions } from './agent-run-actions';

const settle = () => new Promise((resolve) => setTimeout(resolve));

/*
 * The agent verbs (epic qits-1667) have no recording in the pinned golden masters yet. Stop and
 * restart answer the agent, so their answers are this recorded agent with the run state the verb
 * leaves; interrupt's is derived from its id and the provider's recorded words.
 */
const AGENT = workspacesGoldenMaster('an agent with a saved prompt draft', 'getAgent');
const AGENT_ID: string = AGENT.agentId;
const API = `/workspaces/api/agents/${AGENT_ID}`;

@Component({
  imports: [AgentRunActions],
  template: `<app-agent-run-actions
    [agentId]="agentId"
    [runState]="runState()"
    (changed)="changed = changed + 1"
  />`,
})
class Host {
  readonly agentId = AGENT_ID;
  readonly runState = signal<string>('RUNNING');
  changed = 0;
}

describe('AgentRunActions', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(runState: string) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.runState.set(runState);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const labels = () =>
      Array.from(element.querySelectorAll('button')).map((b) => b.textContent?.trim());
    const button = (label: string) =>
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    return { fixture, labels, button, text };
  }

  async function answered(fixture: { detectChanges(): void }) {
    await settle();
    fixture.detectChanges();
  }

  it('offers each verb only in the run states it applies to', () => {
    expect(render('RUNNING').labels()).toEqual(['Interrupt', 'Stop', 'Restart']);
    expect(render('YIELDED').labels()).toEqual(['Stop', 'Restart']);
    expect(render('STOPPED').labels()).toEqual(['Restart']);
    expect(render('QUEUED').labels()).toEqual(['Stop']);
  });

  it('interrupts a running agent at once, and says what the service did', async () => {
    const { fixture, button, text } = render('RUNNING');
    button('Interrupt').click();
    fixture.detectChanges();
    expect(text()).toContain('Interrupting…');
    await settle();
    const request = http.expectOne(`${API}/interrupt`);
    expect(request.request.method).toBe('POST');
    request.flush({
      agentId: AGENT_ID,
      interrupted: true,
      detail: 'ESC was sent to the agent’s harness.',
    });
    await answered(fixture);
    expect(text()).toContain('ESC was sent to the agent’s harness.');
    expect(fixture.componentInstance.changed).toBe(1);
  });

  it('stops the agent only once the stop is confirmed', async () => {
    const { fixture, button, text } = render('YIELDED');
    button('Stop').click();
    fixture.detectChanges();
    http.expectNone(`${API}/stop`);
    expect(button('Cancel')).toBeTruthy();
    button('Confirm stop?').click();
    await settle();
    http.expectOne(`${API}/stop`).flush({ ...AGENT, runState: 'STOPPED' });
    await answered(fixture);
    expect(button('Cancel')).toBeUndefined();
    expect(text()).not.toContain('did not work');
    expect(fixture.componentInstance.changed).toBe(1);
  });

  it('cancels a restart it was asked to confirm', () => {
    const { fixture, button } = render('STOPPED');
    button('Restart').click();
    fixture.detectChanges();
    button('Cancel').click();
    fixture.detectChanges();
    expect(button('Restart')).toBeTruthy();
    http.expectNone(`${API}/restart`);
  });

  it('says a refused restart in the service’s words, and still has the page read again', async () => {
    const { fixture, button, text } = render('STOPPED');
    button('Restart').click();
    fixture.detectChanges();
    button('Confirm restart?').click();
    await settle();
    http
      .expectOne(`${API}/restart`)
      .flush(
        { message: 'The agent has not started yet.' },
        { status: 409, statusText: 'Conflict' },
      );
    await answered(fixture);
    expect(text()).toContain('That did not work — 409 The agent has not started yet.');
    expect(fixture.componentInstance.changed).toBe(1);
  });
});
