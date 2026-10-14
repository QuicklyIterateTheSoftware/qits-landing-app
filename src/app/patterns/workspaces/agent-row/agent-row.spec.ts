import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgentRow, type AgentRowData } from './agent-row';

@Component({
  imports: [AgentRow],
  template: `<app-agent-row [agent]="agent()" [slug]="slug()" />`,
})
class Host {
  readonly agent = signal<AgentRowData>({});
  readonly slug = signal<string | undefined>('qits');
}

describe('AgentRow', () => {
  function render(agent: AgentRowData, slug: string | undefined = 'qits') {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.agent.set(agent);
    fixture.componentInstance.slug.set(slug);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('links the item’s agent page and says how the agent runs', () => {
    const element = render({
      entityId: 'qits-617',
      entityTitle: 'Fix it',
      state: 'ACTIVE',
      runState: 'RUNNING',
      harness: 'CLAUDE',
      activity: 'BUSY',
    });
    expect(element.querySelector('a')?.getAttribute('href')).toBe(
      '/projects/qits/work/detail/qits-617/agent',
    );
    expect(element.textContent).toContain('Fix it');
    expect(element.textContent).toContain('active');
    expect(element.textContent).toContain('running');
    expect(element.textContent).toContain('working');
    expect(element.textContent).toContain('claude');
  });

  it('names a declared wait, and never calls it waiting on you (qits-1229)', () => {
    const element = render({
      entityId: 'qits-617',
      activity: 'WAITING',
      waitingOn: 'release-request rr-1',
    });
    expect(element.querySelector('[role=status]')?.textContent).toContain(
      'waiting on release-request rr-1',
    );
    expect(element.textContent).not.toContain('waiting on you');
  });

  it('says a person is awaited when the agent waits without a declared wait', () => {
    const element = render({ entityId: 'qits-617', activity: 'WAITING' });
    expect(element.textContent).toContain('waiting on you');
    expect(element.querySelector('[role=status]')).toBeNull();
  });

  it('has no link without a project', () => {
    expect(render({ entityId: 'qits-617' }, '').querySelector('a')).toBeNull();
  });

  it('names an agent without an item by its id, without a link', () => {
    const element = render({ agentId: 'a1' });
    expect(element.querySelector('a')).toBeNull();
    expect(element.textContent).toContain('a1');
  });
});
