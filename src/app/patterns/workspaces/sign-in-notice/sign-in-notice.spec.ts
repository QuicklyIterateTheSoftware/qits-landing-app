import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HARNESS_REPORT } from '$core/workspaces/agent-sign-in.operations';
import { workspaceDaemonGoldenMaster } from '../../../../testing/golden-masters';
import { SignInNotice, type HarnessReportRead } from './sign-in-notice';

const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';

/** The harness setup's `HARNESS_REPORT` read, answered with `state`'s recorded report. */
const reportOf = (state: string) =>
  ({
    operation: HARNESS_REPORT,
    hasValue: () => true,
    value: signal(workspaceDaemonGoldenMaster(state, 'availableAgents')),
  }) as unknown as HarnessReportRead;

@Component({
  imports: [SignInNotice],
  template: `<app-sign-in-notice
    [report]="report()"
    [harness]="harness()"
    [commandId]="commandId()"
    [opening]="opening()"
    [problem]="problem()"
    (open)="opened.push($event)"
  />`,
})
class Host {
  readonly report = signal(reportOf(SIGNED_IN));
  readonly harness = signal<string | null>('CLAUDE');
  readonly commandId = signal<string | null>(null);
  readonly opening = signal(false);
  readonly problem = signal<string | null>(null);
  readonly opened: unknown[] = [];
}

/** `SignInNotice` on qits-workspace-daemon's recorded harness reports. */
describe('SignInNotice', () => {
  function render(report: string, harness: string | null = 'CLAUDE') {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.report.set(reportOf(report));
    fixture.componentInstance.harness.set(harness);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, text: () => element.textContent?.replace(/\s+/g, ' ') ?? '' };
  }

  it('says nothing while the harness is signed in', () => {
    const { text } = render(SIGNED_IN);
    expect(text().trim()).toBe('');
  });

  it('says nothing about a harness other than the agent’s', () => {
    const { text } = render(SIGNED_OUT, 'KIMI');
    expect(text().trim()).toBe('');
  });

  it('says nobody signed in, asks to open the sign-in terminal, and steps aside once it is open', () => {
    const { fixture, element, text } = render(SIGNED_OUT);
    expect(text()).toContain('Nobody has signed Claude Code in on the shared credential volume');
    element.querySelector('button')!.click();
    expect(fixture.componentInstance.opened).toEqual(['CLAUDE']);
    fixture.componentInstance.opening.set(true);
    fixture.detectChanges();
    expect(text()).toContain('Opening…');
    fixture.componentInstance.opening.set(false);
    fixture.componentInstance.commandId.set('c-1');
    fixture.detectChanges();
    expect(text().trim()).toBe('');
  });

  it('says why the terminal did not open', () => {
    const { fixture, text } = render(SIGNED_OUT);
    fixture.componentInstance.problem.set('The sign-in terminal did not open — 503.');
    fixture.detectChanges();
    expect(text()).toContain('The sign-in terminal did not open — 503.');
  });
});
