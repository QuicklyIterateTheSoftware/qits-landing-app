import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Action } from './action';
import { ActionButton, ActionJoin } from './action-button';

@Component({
  imports: [ActionButton],
  template: `<ui-action-button [action]="action()" [join]="join()" />`,
})
class Host {
  readonly calls = signal(0);
  readonly action = signal<Action>({
    label: 'Retry',
    variant: 'success',
    callback: () => this.calls.update((n) => n + 1),
  });
  readonly join = signal<ActionJoin>('none');
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  return { fixture, host: fixture.componentInstance, button };
}

describe('ActionButton', () => {
  it('shows the label and calls the callback on click', () => {
    const { host, button } = render();
    expect(button.textContent?.trim()).toBe('Retry');
    expect(button.type).toBe('button');
    button.click();
    button.click();
    expect(host.calls()).toBe(2);
  });

  it.each([
    ['success', 'bg-mint-leaf-700'],
    ['danger', 'bg-cinnabar-600'],
    ['muted', 'bg-white'],
  ] as const)('colours the %s variant', (variant, colour) => {
    const { fixture, host, button } = render();
    host.action.set({ label: 'Go', variant, callback: () => undefined });
    fixture.detectChanges();
    expect(button.dataset['variant']).toBe(variant);
    expect(button.classList).toContain(colour);
  });

  it.each([
    ['none', ['rounded-md'], ['-ml-px']],
    ['start', ['rounded-l-md'], ['-ml-px', 'rounded-md']],
    ['middle', ['-ml-px'], ['rounded-md', 'rounded-l-md', 'rounded-r-md']],
    ['end', ['-ml-px', 'rounded-r-md'], ['rounded-md']],
  ] as const)('rounds the outer corners when joined at %s', (join, present, absent) => {
    const { fixture, host, button } = render();
    host.join.set(join);
    fixture.detectChanges();
    for (const c of present) expect(button.classList).toContain(c);
    for (const c of absent) expect(button.classList).not.toContain(c);
  });

  it('has no popover and no description without details', () => {
    const { fixture, button } = render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('ui-popover')).toBeNull();
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows its details in a popover the button names as its description', () => {
    const { fixture, host } = render();
    host.action.set({
      label: 'Dispatch',
      variant: 'success',
      callback: () => host.calls.update((n) => n + 1),
      details: { title: 'Moves through', items: ['Refining', 'Implementing', 'Reviewing'] },
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    const panel = element.querySelector<HTMLElement>('ui-popover [role=tooltip]')!;
    expect(button.getAttribute('aria-describedby')).toBe(panel.id);
    expect(panel.querySelector('p')?.textContent?.trim()).toBe('Moves through');
    expect([...panel.querySelectorAll('ol > li')].map((li) => li.textContent?.trim())).toEqual([
      'Refining',
      'Implementing',
      'Reviewing',
    ]);
    button.click();
    expect(host.calls()).toBe(1);
  });

  it('leaves out the title when the details have none', () => {
    const { fixture, host } = render();
    host.action.set({
      label: 'Go',
      variant: 'muted',
      callback: () => undefined,
      details: { items: ['One'] },
    });
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('[role=tooltip]')!;
    expect(panel.querySelector('p')).toBeNull();
    expect(panel.querySelectorAll('li').length).toBe(1);
  });
});
