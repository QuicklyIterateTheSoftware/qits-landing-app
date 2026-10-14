import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoadFailure } from './load-failure';

@Component({
  imports: [LoadFailure],
  template: `<ui-load-failure [message]="message()" (retry)="retries.set(retries() + 1)" />`,
})
class Host {
  readonly message = signal('The release request could not be read.');
  readonly retries = signal(0);
}

describe('LoadFailure', () => {
  it('says what failed, as an alert', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The release request could not be read.');
  });

  it('emits retry on each click of Retry', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.textContent?.trim()).toBe('Retry');
    button.click();
    button.click();
    expect(fixture.componentInstance.retries()).toBe(2);
  });
});
