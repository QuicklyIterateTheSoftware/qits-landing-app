import { TestBed } from '@angular/core/testing';
import { THEME_PREFERENCE_KEY, ThemePreferenceStore } from '$core/appearance/theme-preference';
import { ThemeMenu } from './theme-menu';

/** The top bar's theme menu (qits-2086) over the real store, on jsdom's storage and `<html>`. */
describe('ThemeMenu', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  function render() {
    const fixture = TestBed.createComponent(ThemeMenu);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    const panel = element.querySelector<HTMLElement>('#theme-menu')!;
    const radio = (label: string) =>
      [...panel.querySelectorAll('label')]
        .find((row) => row.textContent?.trim() === label)!
        .querySelector('input')!;
    const checked = () =>
      [...panel.querySelectorAll('label')]
        .filter((row) => row.querySelector('input')!.checked)
        .map((row) => row.textContent?.trim());
    const icon = () => element.querySelector('svg')!.getAttribute('data-preference');
    return { fixture, button, panel, radio, checked, icon };
  }

  it('is a Theme button over a fieldset of System, Light and Dark, System checked', () => {
    const { button, panel, checked, icon } = render();
    expect(button.getAttribute('aria-label')).toBe('Theme');
    expect(panel.querySelector('legend')?.textContent?.trim()).toBe('Theme');
    expect([...panel.querySelectorAll('label')].map((row) => row.textContent?.trim())).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
    expect(checked()).toEqual(['System']);
    expect(icon()).toBe('system');
  });

  it('checks the stored preference and shows its icon', () => {
    const { fixture, checked, icon } = render();
    TestBed.inject(ThemePreferenceStore).set('dark');
    fixture.detectChanges();
    expect(checked()).toEqual(['Dark']);
    expect(icon()).toBe('dark');
  });

  it('switches the store when a radio is picked', () => {
    const { fixture, button, radio, checked, icon } = render();
    const themes = TestBed.inject(ThemePreferenceStore);
    button.click();
    fixture.detectChanges();

    radio('Light').click();
    fixture.detectChanges();
    expect(themes.preference()).toBe('light');
    expect(localStorage.getItem(THEME_PREFERENCE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(checked()).toEqual(['Light']);
    expect(icon()).toBe('light');

    radio('System').click();
    fixture.detectChanges();
    expect(themes.preference()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(icon()).toBe('system');
  });
});
