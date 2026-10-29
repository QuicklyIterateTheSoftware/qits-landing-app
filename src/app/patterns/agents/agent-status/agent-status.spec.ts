import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { AgentStatus, type AgentStatusData } from './agent-status';

@Component({
  imports: [AgentStatus],
  template: `<app-agent-status [agent]="agent()" />`,
})
class Host {
  readonly agent = signal<AgentStatusData>({});
}

/** `AgentStatus`'s run state line (epic qits-1667); its waits and attention are the pages' specs'. */
describe('AgentStatus', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestPlatformOrigins(),
      ],
    });
  });

  function render(agent: AgentStatusData) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.agent.set(agent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says a stopped agent was stopped by a person, and how it starts again', () => {
    const element = render({ agentId: 'a-1', runState: 'STOPPED' });
    expect(element.querySelector('[data-stopped]')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'stopped by a person: it starts again when somebody restarts or prompts it.',
    );
  });

  it('says nothing about an agent that is not stopped', () => {
    for (const runState of ['RUNNING', 'YIELDED', 'QUEUED', null]) {
      const element = render({ agentId: 'a-1', runState });
      expect(element.querySelector('[data-stopped]')).toBeNull();
      expect(element.textContent?.trim()).toBe('');
    }
  });
});
