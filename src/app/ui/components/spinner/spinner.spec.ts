import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Spinner } from './spinner';

@Component({
  imports: [Spinner],
  template: `<ui-spinner [loading]="loading()"><p>content</p></ui-spinner>`,
})
class Host {
  readonly loading = signal(true);
}

describe('Spinner', () => {
  it('overlays an image named "Loading" on its content while loading, and nothing after', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const host = element.querySelector('ui-spinner')!;
    expect(element.querySelector('p')?.textContent).toBe('content');
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('Loading');
    expect(host.querySelectorAll('animateTransform').length).toBe(5);

    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    expect(host.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelector('svg')).toBeNull();
    expect(element.querySelector('p')?.textContent).toBe('content');
  });
});
