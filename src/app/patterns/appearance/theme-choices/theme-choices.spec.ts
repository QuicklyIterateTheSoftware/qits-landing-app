import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { THEME_PREFERENCE_KEY, ThemePreferenceStore } from '$core/appearance/theme-preference';
import { ThemeChoices } from './theme-choices';

/** Two places on one page, as the shell has them: the top bar's menu and the navigation. */
@Component({
  imports: [ThemeChoices],
  template: `<app-theme-choices name="one" /><app-theme-choices name="two" />`,
})
class Host {}

/** The theme radios (qits-2086) over the real store, on jsdom's storage and `<html>`. */
describe('ThemeChoices', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [first, second] = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('fieldset'),
    ];
    const radio = (fieldset: HTMLFieldSetElement, label: string) =>
      [...fieldset.querySelectorAll('label')]
        .find((row) => row.textContent?.trim() === label)!
        .querySelector('input')!;
    const checked = (fieldset: HTMLFieldSetElement) =>
      [...fieldset.querySelectorAll('label')]
        .filter((row) => row.querySelector('input')!.checked)
        .map((row) => row.textContent?.trim());
    return { fixture, first, second, radio, checked };
  }

  it('is a Theme fieldset of System, Light and Dark, System checked, one group per place', () => {
    const { first, second, checked } = render();
    expect(first.querySelector('legend')?.textContent?.trim()).toBe('Theme');
    expect([...first.querySelectorAll('label')].map((row) => row.textContent?.trim())).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
    expect(checked(first)).toEqual(['System']);
    expect(first.querySelector('input')!.name).toBe('one');
    expect(second.querySelector('input')!.name).toBe('two');
  });

  it('checks the store’s preference', () => {
    const { fixture, first, checked } = render();
    TestBed.inject(ThemePreferenceStore).set('dark');
    fixture.detectChanges();
    expect(checked(first)).toEqual(['Dark']);
  });

  it('switches the store when a radio is picked, and every place follows', () => {
    const { fixture, first, second, radio, checked } = render();
    const themes = TestBed.inject(ThemePreferenceStore);

    radio(first, 'Light').click();
    fixture.detectChanges();
    expect(themes.preference()).toBe('light');
    expect(localStorage.getItem(THEME_PREFERENCE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(checked(second)).toEqual(['Light']);

    radio(second, 'System').click();
    fixture.detectChanges();
    expect(themes.preference()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(checked(first)).toEqual(['System']);
  });
});
