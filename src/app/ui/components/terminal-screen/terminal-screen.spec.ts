import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TerminalScreen, type ScreenFrames } from './terminal-screen';

@Component({
  imports: [TerminalScreen],
  template: `<ui-terminal-screen [frames]="frames()" label="Agent terminal" />`,
})
class Host {
  readonly frames = signal<ScreenFrames>({ generation: 1, chunks: ['$ ls\r\n', 'README.md'] });
}

/** Without `matchMedia` (jsdom, as on the server) xterm.js is not loaded: the frames show as text. */
describe('TerminalScreen', () => {
  it('shows the frames as text until a terminal can mount, under its label', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[aria-label="Agent terminal"]')).not.toBeNull();
    expect(element.querySelector('pre')?.textContent).toContain('README.md');
    expect(element.querySelector('.xterm')).toBeNull();

    fixture.componentInstance.frames.set({ generation: 2, chunks: ['again'] });
    fixture.detectChanges();
    expect(element.querySelector('pre')?.textContent?.trim()).toBe('again');
  });
});
