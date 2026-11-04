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

@Component({
  imports: [Dropdown],
  template: `
    <ui-dropdown label="Path" panelLabel="Full path" panelId="path" align="start">
      <span dropdown-trigger>…</span>
      <p dropdown-panel>Panel content</p>
    </ui-dropdown>
  `,
})
class StartHost {}

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

  it('hangs the panel from the button’s right edge at a fixed width by default', () => {
    const { panel } = render();
    expect(panel.classList).toContain('right-0');
    expect(panel.classList).toContain('w-80');
    expect(panel.classList).not.toContain('left-0');
  });

  it('hangs the panel from the button’s left edge, as wide as its content, with align="start"', () => {
    const fixture = TestBed.createComponent(StartHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector<HTMLButtonElement>('ui-dropdown button')!;
    const panel = element.querySelector<HTMLElement>('#path')!;
    expect(panel.classList).toContain('left-0');
    expect(panel.classList).toContain('w-max');
    expect(panel.classList).toContain('max-w-[calc(100vw-4rem)]');
    expect(panel.classList).not.toContain('right-0');
    expect(panel.classList).not.toContain('w-80');
    expect(panel.classList).toContain('hidden');
    button.click();
    fixture.detectChanges();
    expect(panel.classList).not.toContain('hidden');
    expect(panel.classList).toContain('left-0');
  });
});
