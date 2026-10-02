import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Spinner, type LoadState } from './spinner';

@Component({
  imports: [Spinner],
  template: `<ui-spinner [state]="state()"><p>content</p></ui-spinner>`,
})
class Host {
  readonly state = signal<LoadState>('loading');
}

describe('Spinner', () => {
  it('overlays "Loading" while loading, "Failed to load" on error, and nothing when loaded', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const host = element.querySelector('ui-spinner')!;
    expect(element.querySelector('p')?.textContent).toBe('content');
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('Loading');
    expect(host.querySelectorAll('animateTransform').length).toBe(5);

    fixture.componentInstance.state.set('error');
    fixture.detectChanges();
    expect(host.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('Failed to load');

    fixture.componentInstance.state.set('loaded');
    fixture.detectChanges();
    expect(host.querySelector('svg')).toBeNull();
    expect(element.querySelector('p')?.textContent).toBe('content');
  });
});
