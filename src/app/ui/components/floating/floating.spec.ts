import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Floating } from './floating';

@Component({
  imports: [Floating],
  template: `
    <button #trigger type="button">Open</button>
    <div
      id="panel"
      class="absolute top-full right-0"
      [uiFloating]="trigger"
      [floatingActive]="open()"
      floatingAlign="end"
    >
      Panel
    </div>
  `,
})
class Host {
  readonly open = signal(false);
}

/**
 * The placement itself needs a layout (`placement.spec.ts` has its arithmetic, the components'
 * browser specs the panels it places); here, what it leaves alone.
 */
describe('Floating', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('#panel')!;
    return { fixture, panel };
  }

  it('leaves an inactive panel to its classes', () => {
    const { panel } = render();
    expect(panel.getAttribute('style')).toBeNull();
    expect(panel.hasAttribute('data-floating-side')).toBe(false);
  });

  it('leaves a panel with no box (not shown, or no layout) to its classes too', () => {
    const { fixture, panel } = render();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(panel.getAttribute('style')).toBeNull();
  });

  it('does nothing on the server, open or not', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const { fixture, panel } = render();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(panel.getAttribute('style')).toBeNull();
    expect(panel.hasAttribute('data-floating-side')).toBe(false);
  });
});
