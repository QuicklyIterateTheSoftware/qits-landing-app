import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SlotDetail } from '$core/workspaces/agents.consumes';
import { SlotStatus } from './slot-status';

@Component({
  imports: [SlotStatus],
  template: `<app-slot-status [slot]="slot()" [hosted]="hosted()" />`,
})
class Host {
  readonly slot = signal<SlotDetail>({});
  readonly hosted = signal<number | undefined>(undefined);
}

describe('SlotStatus', () => {
  function render(slot: SlotDetail, hosted?: number) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.slot.set(slot);
    fixture.componentInstance.hosted.set(hosted);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }

  it('shows the container, a connected daemon and the hosted agents', () => {
    const text = render(
      {
        runtimeStatus: 'RUNNING',
        placement: 'RUNNER',
        daemonConnectedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        daemonVersion: '1.2.3',
        daemonOutdated: true,
      },
      1,
    );
    expect(text).toContain('running');
    expect(text).toContain('placed on a runner');
    expect(text).toContain('connected 5m ago');
    expect(text).toContain('version 1.2.3');
    expect(text).toContain('outdated');
    expect(text).toContain('1 agent');
  });

  it('says so when the daemon should be up and is not, and shows the container’s error', () => {
    const text = render({ runtimeStatus: 'RUNNING', runtimeError: 'image pull failed' });
    expect(text).toContain('Not connected');
    expect(text).toContain('image pull failed');
    expect(text).not.toContain('Agents');
  });

  it('has no daemon to reach while no container runs, and names an admin slot', () => {
    const text = render({ runtimeStatus: 'PROVISIONING', placement: 'RUNNER', admin: true }, 0);
    expect(text).toContain('No container running');
    expect(text).toContain('docker socket');
    expect(text).toContain('0 agents');
  });
});
