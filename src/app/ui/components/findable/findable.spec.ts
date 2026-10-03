import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Findable } from './findable';

@Component({
  imports: [Findable],
  template: `<div [uiFindable]="collapsed()" (found)="found = found + 1">Hidden text</div>`,
})
class Host {
  readonly collapsed = signal(true);
  found = 0;
}

describe('Findable', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = (fixture.nativeElement as HTMLElement).querySelector('div') as HTMLElement;
    return { fixture, host: fixture.componentInstance, element };
  }

  it('hides collapsed content until found, not by CSS', () => {
    const { fixture, host, element } = render();
    expect(element.getAttribute('hidden')).toBe('until-found');
    host.collapsed.set(false);
    fixture.detectChanges();
    expect(element.hasAttribute('hidden')).toBe(false);
  });

  it('emits found on beforematch', () => {
    const { host, element } = render();
    element.dispatchEvent(new Event('beforematch'));
    expect(host.found).toBe(1);
  });
});
