import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Action, ActionGroup } from '$ui/components/action-button/action';
import { PageLayoutComponent } from './page-layout';

const noop = () => undefined;

@Component({
  imports: [PageLayoutComponent],
  template: `<app-page-layout [title]="title()" [actions]="actions()"
    ><p>Content</p></app-page-layout
  >`,
})
class WithInputs {
  readonly title = signal('Work');
  readonly actions = signal<readonly (Action | ActionGroup)[]>([]);
}

@Component({
  imports: [PageLayoutComponent],
  template: `
    <app-page-layout title="Ignored" [actions]="actions">
      <h1 slot="header">Custom header</h1>
      <a slot="actions" href="/archive">Archive</a>
      <p>Content</p>
    </app-page-layout>
  `,
})
class WithSlots {
  readonly actions: Action[] = [{ label: 'Ignored action', variant: 'muted', callback: noop }];
}

@Component({
  imports: [PageLayoutComponent],
  template: `
    <app-page-layout>
      <div uiPageHeader><h1>Directive header</h1></div>
      <div uiPageActions><button type="button">Directive action</button></div>
    </app-page-layout>
  `,
})
class WithAttributes {}

function render<T>(type: new () => T) {
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element, host: fixture.componentInstance };
}

const actionsBox = (element: HTMLElement) =>
  element.querySelector<HTMLElement>('[data-page-actions]')!;

describe('PageLayoutComponent', () => {
  it('shows the title as the h1 and the content below', () => {
    const { element } = render(WithInputs);
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Work');
    expect(element.querySelector('p')?.textContent).toBe('Content');
    expect(actionsBox(element).querySelectorAll('button')).toHaveLength(0);
  });

  it('prefers the projected header and actions over the inputs', () => {
    const { element } = render(WithSlots);
    const headings = [...element.querySelectorAll('h1')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Custom header']);
    expect(element.textContent).not.toContain('Ignored');
    const actions = actionsBox(element);
    expect(actions.querySelector('a')?.textContent).toBe('Archive');
    expect(actions.querySelectorAll('button')).toHaveLength(0);
  });

  it('takes the uiPageHeader and uiPageActions attributes as slots too', () => {
    const { element } = render(WithAttributes);
    expect(element.querySelector('h1')?.textContent).toBe('Directive header');
    expect(actionsBox(element).textContent).toContain('Directive action');
  });

  it('renders single actions and calls their callbacks', () => {
    const { fixture, element, host } = render(WithInputs);
    const called: string[] = [];
    host.actions.set([
      { label: 'Approve', variant: 'success', callback: () => called.push('approve') },
      { label: 'Delete', variant: 'danger', callback: () => called.push('delete') },
    ]);
    fixture.detectChanges();
    const buttons = [...actionsBox(element).querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Approve', 'Delete']);
    expect(buttons.map((b) => b.dataset['variant'])).toEqual(['success', 'danger']);
    buttons[1].click();
    expect(called).toEqual(['delete']);
    // A single action is no group.
    expect(element.querySelectorAll('[role=group]')).toHaveLength(0);
  });

  it('renders a group as a role=group named by its title, with joined buttons', () => {
    const { fixture, element, host } = render(WithInputs);
    host.actions.set([
      {
        title: 'Release',
        actions: [
          { label: 'Approve', variant: 'success', callback: noop },
          { label: 'Hold', variant: 'muted', callback: noop },
          { label: 'Reject', variant: 'danger', callback: noop },
        ],
      },
      { actions: [{ label: 'Untitled', variant: 'muted', callback: noop }] },
    ]);
    fixture.detectChanges();
    const groups = element.querySelectorAll<HTMLElement>('[role=group]');
    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('aria-label')).toBe('Release');
    expect(groups[0].querySelector('span')?.textContent).toBe('Release');
    expect(groups[0].querySelector('span')?.classList).toContain('inline');
    const joined = [...groups[0].querySelectorAll('button')];
    expect(joined[0].classList).toContain('rounded-l-md');
    expect(joined[1].classList).toContain('-ml-px');
    expect(joined[2].classList).toContain('rounded-r-md');
    expect(groups[1].hasAttribute('aria-label')).toBe(false);
    expect(groups[1].querySelector('span')?.classList).toContain('hidden');
  });
});
