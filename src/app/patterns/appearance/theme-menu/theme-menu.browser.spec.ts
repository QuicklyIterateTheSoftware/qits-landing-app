import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { THEME_PREFERENCE_KEY } from '$core/appearance/theme-preference';
import { ThemeMenu } from './theme-menu';

/** Screenshots of the top bar's theme menu (qits-2086): it reads no backend, only the browser. */
describe('ThemeMenu (screenshots)', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_PREFERENCE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  /** The menu at the right of a 400px-wide bar, room below it for the panel; nothing opened. */
  function render() {
    const fixture = TestBed.createComponent(ThemeMenu);
    const element = fixture.nativeElement as HTMLElement;
    element.parentElement!.style.cssText =
      'display:flex; justify-content:flex-end; width:25rem; height:10rem; padding:0.5rem; align-items:flex-start';
    fixture.detectChanges();
    return { fixture, frame: page.elementLocator(element.parentElement!) };
  }

  it('is a monitor while it follows the system, closed', async () => {
    const { frame } = render();
    await expect.element(frame).toMatchScreenshot('closed', { kind: 'DATA' });
  });

  it('lists System, Light and Dark, System checked', async () => {
    const { frame } = render();
    await page.getByRole('button', { name: 'Theme' }).click();
    await expect.element(page.getByRole('radio', { name: 'System' })).toBeChecked();
    await expect.element(frame).toMatchScreenshot('open', { kind: 'DATA' });
  });

  it('is a moon once Dark is picked, and the menu turns dark', async () => {
    const { frame } = render();
    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect.element(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    await expect.element(frame).toMatchScreenshot('dark', { kind: 'DATA' });
  });
});
