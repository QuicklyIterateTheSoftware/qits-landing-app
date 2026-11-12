import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { TerminalScreen, type ScreenFrames, type ScreenSize } from './terminal-screen';

/** Screenshots of a terminal screen showing a shell session, in a fixed box. */
@Component({
  imports: [TerminalScreen],
  host: { class: 'block w-[36rem] h-[20rem] overflow-auto p-4' },
  template: `<ui-terminal-screen
    [frames]="frames"
    [attached]="true"
    label="Agent terminal"
    (resized)="sizes.push($event)"
  />`,
})
class Screen {
  readonly screen = viewChild.required(TerminalScreen);
  readonly sizes: ScreenSize[] = [];
  readonly frames: ScreenFrames = {
    generation: 1,
    chunks: [
      '\x1b[1;32magent@workspace\x1b[0m:\x1b[1;34m~/wrapper\x1b[0m$ git status\r\n',
      'On branch ticket/qits-1240\r\n',
      'nothing to commit, working tree clean\r\n',
      '\x1b[1;32magent@workspace\x1b[0m:\x1b[1;34m~/wrapper\x1b[0m$ ',
    ],
  };
}

describe('TerminalScreen (screenshots)', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('draws the session in xterm.js, fitted to its box', async () => {
    const fixture = TestBed.createComponent(Screen);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    await expect
      .poll(() => element.querySelector('.xterm-rows')?.textContent ?? '')
      .toContain('working tree clean');
    expect(fixture.componentInstance.sizes.length).toBeGreaterThan(0);
    await expect
      .element(page.elementLocator(element))
      .toMatchScreenshot('session', { kind: 'DATA' });
  });

  it('lets the box paint the background and repaints the text when the scheme changes (qits-2086)', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const fixture = TestBed.createComponent(Screen);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    await expect
      .poll(() => element.querySelector('.xterm-rows')?.textContent ?? '')
      .toContain('working tree clean');
    // xterm.js paints no background of its own, so a scheme switch never waits on it.
    const background = getComputedStyle(
      element.querySelector<HTMLElement>('.xterm-scrollable-element')!,
    ).backgroundColor;
    expect(background).toBe('rgba(0, 0, 0, 0)');
    // The text is xterm.js's own, in the box's text colour.
    const text = () => getComputedStyle(element.querySelector<HTMLElement>('.xterm-rows')!).color;
    const light = text();

    document.documentElement.setAttribute('data-theme', 'dark');
    await expect.poll(text).not.toBe(light);
    const dark = text();

    document.documentElement.setAttribute('data-theme', 'light');
    await expect.poll(text).toBe(light);
    expect(dark).not.toBe(light);
  });
});
