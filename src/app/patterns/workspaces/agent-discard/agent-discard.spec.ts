import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import {
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../testing/golden-masters';
import { AgentDiscard } from './agent-discard';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const WAITING = 'an agent waiting for a workspace slot';
const LEFTOVER = 'an agent with leftover work';
const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const { agentId } = workspacesGoldenMasters.operation(LEFTOVER, 'discardAgent').params;
const DISCARD = `/workspaces/api/agents/${agentId}/discard`;

@Component({
  imports: [AgentDiscard],
  template: `<app-agent-discard [agentId]="agentId" (discarded)="discarded = discarded + 1" />`,
})
class Host {
  readonly agentId = agentId;
  discarded = 0;
}

describe('AgentDiscard', () => {
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

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    const press = (label: string) => {
      button(label).click();
      fixture.detectChanges();
    };
    return { fixture, button, text, press };
  }

  it('asks first, then discards without force', async () => {
    const { fixture, press } = render();
    press('Discard');
    press('Confirm discard?');
    await settle();
    const request = http.expectOne(DISCARD);
    expect(request.request.body).toEqual({ force: false });
    // The recorded discard of a waiting agent: the same answer's shape, the agent REMOVED.
    request.flush(workspacesGoldenMaster(WAITING, 'discardAgent'));
    await settle();
    fixture.detectChanges();
    expect(fixture.componentInstance.discarded).toBe(1);
  });

  it('can be called off before it is sent', () => {
    const { button, press } = render();
    press('Discard');
    press('Cancel');
    expect(button('Discard')).toBeDefined();
    expect(button('Cancel')).toBeUndefined();
  });

  it('shows leftover work in the service’s words, and discards with force on a second word', async () => {
    const { fixture, text, press } = render();
    press('Discard');
    press('Confirm discard?');
    await settle();
    const body = workspacesGoldenMaster(LEFTOVER, 'discardAgent');
    http.expectOne(DISCARD).flush(body, { status: 409, statusText: 'Conflict' });
    await settle();
    fixture.detectChanges();
    expect(text()).toContain('The service refused the discard.');
    expect(text()).toContain(body.message);
    expect(fixture.componentInstance.discarded).toBe(0);
    press('Discard anyway');
    await settle();
    const forced = http.expectOne(DISCARD);
    expect(forced.request.body).toEqual({ force: true });
    // No forced discard is recorded: the answer is the recorded discard of a waiting agent.
    forced.flush(workspacesGoldenMaster(WAITING, 'discardAgent'));
    await settle();
    fixture.detectChanges();
    expect(fixture.componentInstance.discarded).toBe(1);
    expect(text()).not.toContain('The service refused');
  });

  it('offers force when the daemon does not answer too', async () => {
    const { fixture, text, press } = render();
    press('Discard');
    press('Confirm discard?');
    await settle();
    const body = workspacesGoldenMaster(UNREACHABLE, 'discardAgent');
    http.expectOne(DISCARD).flush(body, { status: 409, statusText: 'Conflict' });
    await settle();
    fixture.detectChanges();
    expect(text()).toContain(body.message);
    expect(text()).toContain('Discard anyway');
  });

  it('says a failure that is not a refusal as it is, and offers no force', async () => {
    const { fixture, text, press } = render();
    press('Discard');
    press('Confirm discard?');
    await settle();
    http.expectOne(DISCARD).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    fixture.detectChanges();
    expect(text()).toContain('The agent was not discarded — 500.');
    expect(text()).not.toContain('Discard anyway');
  });
});
