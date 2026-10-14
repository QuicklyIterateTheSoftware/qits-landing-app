import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RunnerRegistration } from '$core/workspaces/runners.consumes';
import { workspacesGoldenMaster } from '../../../../testing/golden-masters';
import { InstallLinePanel } from './install-line-panel';

const REGISTRATION: RunnerRegistration = workspacesGoldenMaster('no runners', 'createRunner');

@Component({
  imports: [InstallLinePanel],
  template: `<app-install-line-panel
    [registration]="registration"
    (closed)="closed = closed + 1"
  />`,
})
class Host {
  readonly registration = REGISTRATION;
  closed = 0;
}

describe('InstallLinePanel', () => {
  it('shows the install line and the token once, and says so', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain(`Install line — ${REGISTRATION.runner?.name}`);
    expect(text).toContain('This is the only time it is shown');
    const codes = Array.from(element.querySelectorAll('code')).map((c) => c.textContent);
    expect(codes).toEqual([REGISTRATION.installLine, REGISTRATION.registrationToken]);
    const labels = Array.from(element.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Copy install line', 'Copy token', 'Close']);
  });

  it('closes on Close', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const close = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Close')!;
    close.click();
    expect(fixture.componentInstance.closed).toBe(1);
  });
});
