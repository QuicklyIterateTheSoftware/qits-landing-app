import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ListLane } from './list-lane';

@Component({
  imports: [ListLane],
  template: `
    <ui-list-lane collapsible [collapsed]="collapsed">
      <span lane-header>Lane</span>
      <span lane-summary>1 task</span>
      <p id="child">A child</p>
    </ui-list-lane>
  `,
})
class Host {
  collapsed = false;
}

describe('ListLane', () => {
  function lane(collapsed: boolean) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.collapsed = collapsed;
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const content = () => element.querySelector('#child')!.parentElement!.parentElement!;
    const summary = () => element.querySelector('[lane-summary]')!.parentElement!;
    const button = () => element.querySelector('button')!;
    return { fixture, content, summary, button };
  }

  it('starts collapsed when told: the summary shows, the children are inert', () => {
    const { content, summary, button } = lane(true);
    expect(content().classList).toContain('grid-rows-[0fr]');
    expect(content().hasAttribute('inert')).toBe(true);
    expect(summary().classList).toContain('opacity-100');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(button().getAttribute('aria-controls')).toBe(content().id);
  });

  it('toggles on a click', () => {
    const { fixture, content, summary, button } = lane(true);
    button().click();
    fixture.detectChanges();
    expect(content().classList).toContain('grid-rows-[1fr]');
    expect(summary().classList).toContain('opacity-0');
  });
});
