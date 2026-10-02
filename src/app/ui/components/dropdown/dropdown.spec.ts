import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dropdown } from './dropdown';

@Component({
  imports: [Dropdown],
  template: `
    <ui-dropdown
      label="Things"
      panelLabel="Recent things"
      panelId="things"
      (opened)="opened = opened + 1"
    >
      <span dropdown-trigger>T</span>
      <p dropdown-panel>Panel content</p>
    </ui-dropdown>
    <button id="outside" type="button">elsewhere</button>
  `,
})
class Host {
  opened = 0;
}

describe('Dropdown', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector<HTMLButtonElement>('ui-dropdown button')!;
    const panel = element.querySelector<HTMLElement>('#things')!;
    return { fixture, element, button, panel };
  }

  it('projects the trigger and the panel, and names both', () => {
    const { button, panel } = render();
    expect(button.textContent?.trim()).toBe('T');
    expect(button.getAttribute('aria-label')).toBe('Things');
    expect(button.getAttribute('aria-haspopup')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('things');
    expect(panel.getAttribute('aria-label')).toBe('Recent things');
    expect(panel.textContent).toContain('Panel content');
  });

  it('opens and closes with its button, and says opened each time it opens', () => {
    const { fixture, button, panel } = render();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(fixture.componentInstance.opened).toBe(1);

    button.click();
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);

    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.opened).toBe(2);
  });

  it('closes on a click outside, and on Escape with the focus back on its button', () => {
    const { fixture, element, button, panel } = render();
    button.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('#outside')!.click();
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);

    button.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});
