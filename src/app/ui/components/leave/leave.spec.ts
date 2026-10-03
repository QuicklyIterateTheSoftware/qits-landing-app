import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Leave, LEAVE_MS } from './leave';

@Component({
  imports: [Leave],
  template: `<div [uiLeave]="leaving()" (left)="left = left + 1">Item</div>`,
})
class Host {
  readonly leaving = signal(false);
  left = 0;
}

describe('Leave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = (fixture.nativeElement as HTMLElement).querySelector('div') as HTMLElement;
    return { fixture, host: fixture.componentInstance, element };
  }

  it('shrinks the element, then emits left', () => {
    const { fixture, host, element } = render();
    host.leaving.set(true);
    fixture.detectChanges();
    expect(element.style.opacity).toBe('0');
    vi.advanceTimersByTime(LEAVE_MS + 150);
    expect(host.left).toBe(1);
  });

  it('restores the element and never emits left when leaving is taken back', () => {
    const { fixture, host, element } = render();
    host.leaving.set(true);
    fixture.detectChanges();
    host.leaving.set(false);
    fixture.detectChanges();
    expect(element.getAttribute('style') ?? '').toBe('');
    vi.advanceTimersByTime(LEAVE_MS * 4);
    expect(host.left).toBe(0);
  });
});
