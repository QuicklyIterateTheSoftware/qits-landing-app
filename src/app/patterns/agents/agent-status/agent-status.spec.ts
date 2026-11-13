import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { EMPTY } from 'rxjs';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import type { ProjectStatusAgent } from '$core/workspaces/agents.consumes';
import { AgentStatus } from './agent-status';

@Component({
  imports: [AgentStatus],
  template: `<app-agent-status [agent]="agent()" />`,
})
class Host {
  readonly agent = signal<ProjectStatusAgent>({});
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
        // The open project's release requests follow the app's stream (`ProjectReleaseRequests`);
        // no project is open here, so nothing is read.
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => EMPTY } },
      ],
    });
  });

  function render(agent: ProjectStatusAgent) {
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
    for (const runState of ['RUNNING', 'YIELDED', 'QUEUED', undefined] as const) {
      const element = render({ agentId: 'a-1', runState });
      expect(element.querySelector('[data-stopped]')).toBeNull();
      expect(element.textContent?.trim()).toBe('');
    }
  });
});
