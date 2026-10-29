import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import type { SlotDetail } from '$core/workspaces/agents.consumes';
import {
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../testing/golden-masters';
import { agentName, ContainerActions, type HostedAgent } from './container-actions';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const STOPPED = 'a stopped workspace slot';
const RUNNING = 'a workspace slot running on a target';
const OFFLINE = 'a workspace slot qits-system cannot be asked about';
const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const ID = Number(
  workspacesGoldenMasters.operation(STOPPED, 'ensureWorkspaceContainer').params['workspaceId'],
);
const SLOT = `/workspaces/api/workspaces/${ID}`;
/** The slot's agents, as qits-workspaces recorded them for "a workspace slot hosting agents". */
const HOSTED: readonly HostedAgent[] = workspacesGoldenMaster(
  'a workspace slot hosting agents',
  'listAgents',
).agents;

@Component({
  imports: [ContainerActions],
  template: `<app-container-actions
    [slot]="slot()"
    [agents]="agents"
    (changed)="changed = changed + 1"
  />`,
})
class Host {
  readonly agents = HOSTED;
  readonly slot = signal<Pick<SlotDetail, 'id' | 'runtimeStatus'>>({
    id: ID,
    runtimeStatus: 'STOPPED',
  });
  changed = 0;
}

describe('ContainerActions', () => {
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

  function render(runtimeStatus: string) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.slot.set({
      id: ID,
      runtimeStatus: runtimeStatus as SlotDetail['runtimeStatus'],
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    return { fixture, button, text };
  }

  async function answered(fixture: { detectChanges(): void }) {
    await settle();
    fixture.detectChanges();
  }

  it('starts a stopped container, and has the page read the slot again', async () => {
    const { fixture, button, text } = render('STOPPED');
    expect(button('Stop')).toBeUndefined();
    button('Start').click();
    fixture.detectChanges();
    expect(text()).toContain('Starting…');
    await settle();
    http
      .expectOne(`${SLOT}/ensure-container`)
      .flush(workspacesGoldenMaster(STOPPED, 'ensureWorkspaceContainer'));
    await answered(fixture);
    expect(fixture.componentInstance.changed).toBe(1);
    expect(text()).not.toContain('That did not work');
  });

  it('asks before a stop, naming the agents it affects, then names those the service affected', async () => {
    const { fixture, button, text } = render('RUNNING');
    button('Stop').click();
    fixture.detectChanges();
    http.expectNone(`${SLOT}/stop-container`);
    expect(text()).toContain(
      'Stopping the container affects its 2 agents: contract-00000001-10, contract-00000001-2.',
    );
    button('Confirm stop?').click();
    await settle();
    // The pinned recording predates `affectedAgentIds` (epic qits-1667): the stop's answer is the
    // recorded one with the slot's first agent named, as the service names the agents it stopped.
    http.expectOne(`${SLOT}/stop-container`).flush({
      ...workspacesGoldenMaster<object>(RUNNING, 'stopWorkspaceContainer'),
      affectedAgentIds: [HOSTED[0].agentId],
    });
    await answered(fixture);
    expect(text()).toContain('Affected agent: contract-00000001-10.');
    expect(text()).not.toContain('Stopping the container affects');
    expect(fixture.componentInstance.changed).toBe(1);
  });

  it('says so when the service names no affected agent', async () => {
    const { fixture, button, text } = render('RUNNING');
    button('Stop').click();
    fixture.detectChanges();
    button('Confirm stop?').click();
    await settle();
    http
      .expectOne(`${SLOT}/stop-container`)
      .flush(workspacesGoldenMaster(RUNNING, 'stopWorkspaceContainer'));
    await answered(fixture);
    expect(text()).toContain('The service says no agent was affected.');
  });

  it('names an agent it does not list by its id', () => {
    expect(agentName(undefined, '0123abcd-0000-4000-8000-000000000000')).toBe('agent 0123abcd');
    expect(agentName(HOSTED[1], HOSTED[1].agentId ?? '')).toBe('contract-00000001-2');
  });

  it('shows a refused start in the service’s words, and still reads the slot again', async () => {
    const { fixture, button, text } = render('UNAVAILABLE');
    expect(text()).toContain('runner is offline');
    button('Start').click();
    await settle();
    const body = workspacesGoldenMaster(OFFLINE, 'ensureWorkspaceContainer');
    http.expectOne(`${SLOT}/ensure-container`).flush(body, { status: 409, statusText: 'Conflict' });
    await answered(fixture);
    expect(text()).toContain(`That did not work — 409 ${body.message}.`);
    expect(fixture.componentInstance.changed).toBe(1);
  });

  it('asks before a recreate, and shows its refusal', async () => {
    const { fixture, button, text } = render('RUNNING');
    button('Recreate').click();
    fixture.detectChanges();
    button('Cancel').click();
    fixture.detectChanges();
    expect(button('Recreate')).toBeDefined();
    button('Recreate').click();
    fixture.detectChanges();
    expect(text()).toContain('Recreating the container affects its 2 agents');
    button('Confirm recreate?').click();
    await settle();
    const body = workspacesGoldenMaster(UNREACHABLE, 'recreateWorkspaceContainer');
    http
      .expectOne(`${SLOT}/recreate-container`)
      .flush(body, { status: 400, statusText: 'Bad Request' });
    await answered(fixture);
    expect(text()).toContain(`That did not work — 400 ${body.message}`);
  });
});
