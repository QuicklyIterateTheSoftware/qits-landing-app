import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Popover, PopoverAlign } from './popover';

@Component({
  imports: [Popover],
  template: `
    <ui-popover #popover panelId="explained" [align]="align()">
      <button type="button" [attr.aria-describedby]="popover.panelId()">Go</button>
      <p popover-content>What going does</p>
    </ui-popover>
  `,
})
class Host {
  readonly align = signal<PopoverAlign>('start');
}

describe('Popover', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const host = element.querySelector<HTMLElement>('ui-popover')!;
    const button = element.querySelector<HTMLButtonElement>('button')!;
    const wrapper = element.querySelector<HTMLElement>('[data-popover-panel]')!;
    const panel = element.querySelector<HTMLElement>('#explained')!;
    return { fixture, host, button, wrapper, panel };
  }

  it('projects the trigger and the content, and names the panel as a tooltip', () => {
    const { button, panel } = render();
    expect(button.textContent?.trim()).toBe('Go');
    expect(panel.getAttribute('role')).toBe('tooltip');
    expect(panel.textContent?.trim()).toBe('What going does');
    expect(button.getAttribute('aria-describedby')).toBe('explained');
  });

  it('is hidden until the host is hovered or holds the focus', () => {
    const { wrapper } = render();
    expect(wrapper.classList).toContain('hidden');
    expect(wrapper.classList).toContain('group-hover/popover:block');
    expect(wrapper.classList).toContain('group-focus-within/popover:block');
  });

  it('lines up with the start edge, or the end edge', () => {
    const { fixture, wrapper } = render();
    expect(wrapper.classList).toContain('left-0');
    fixture.componentInstance.align.set('end');
    fixture.detectChanges();
    expect(wrapper.classList).toContain('right-0');
    expect(wrapper.classList).not.toContain('left-0');
  });

  it('closes on Escape until the pointer or the focus comes back', () => {
    const { fixture, host, wrapper } = render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(wrapper.classList).toContain('hidden');
    expect(wrapper.classList).not.toContain('group-hover/popover:block');

    host.dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(wrapper.classList).toContain('group-hover/popover:block');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    host.dispatchEvent(new FocusEvent('focusin'));
    fixture.detectChanges();
    expect(wrapper.classList).toContain('group-focus-within/popover:block');
  });

  it('gives every panel its own id', () => {
    const a = TestBed.createComponent(Popover);
    const b = TestBed.createComponent(Popover);
    expect(a.componentInstance.panelId()).not.toBe(b.componentInstance.panelId());
  });
});
