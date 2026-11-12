import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { THEME_PREFERENCE_KEY, ThemePreferenceStore } from './theme-preference';

/**
 * The colour scheme setting (qits-2086) on jsdom's `localStorage` and `<html>`: the default, the
 * stored value applied only after the first render, each choice's key and attribute, an unknown
 * value, a storage that throws, and the OS's answer for System.
 */
describe('ThemePreferenceStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (document.defaultView as Partial<Window> | null)?.matchMedia;
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  /** The store in a browser (or on the server), before and after the first render. */
  function store(platform: 'browser' | 'server' = 'browser') {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    const themes = TestBed.inject(ThemePreferenceStore);
    const before = themes.preference();
    TestBed.tick();
    return { themes, before };
  }

  /** A `matchMedia` whose dark answer the test moves, firing `change` as a browser does. */
  function osScheme(dark: boolean) {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
      matches: dark,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    };
    // On the document's own window, which the store asks (jsdom has no matchMedia of its own).
    Object.defineProperty(document.defaultView!, 'matchMedia', {
      configurable: true,
      value: () => query,
    });
    return (next: boolean) => {
      query.matches = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    };
  }

  it('follows the system when nothing is stored', () => {
    const { themes, before } = store();
    expect(before).toBe('system');
    expect(themes.preference()).toBe('system');
    expect(themes.resolved()).toBe('light');
  });

  it('applies the stored preference only after the first render, so hydration meets System', () => {
    localStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    const { themes, before } = store();
    expect(before).toBe('system');
    expect(themes.preference()).toBe('dark');
    expect(themes.resolved()).toBe('dark');
  });

  it('says System and light on the server, whatever is stored', () => {
    localStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { themes } = store('server');
    expect(themes.preference()).toBe('system');
    expect(themes.resolved()).toBe('light');
    expect(getItem).not.toHaveBeenCalled();
  });

  it('reads an unknown stored value as System', () => {
    localStorage.setItem(THEME_PREFERENCE_KEY, 'sepia');
    expect(store().themes.preference()).toBe('system');
  });

  it('forces light or dark: stores the key and sets data-theme on <html>', () => {
    const { themes } = store();
    themes.set('dark');
    expect(themes.preference()).toBe('dark');
    expect(themes.resolved()).toBe('dark');
    expect(localStorage.getItem(THEME_PREFERENCE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    themes.set('light');
    expect(themes.resolved()).toBe('light');
    expect(localStorage.getItem(THEME_PREFERENCE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('goes back to System: removes the key and data-theme', () => {
    const { themes } = store();
    themes.set('dark');
    themes.set('system');
    expect(themes.preference()).toBe('system');
    expect(localStorage.getItem(THEME_PREFERENCE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('keeps a choice made before the first render over the stored one', () => {
    localStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    TestBed.configureTestingModule({});
    const themes = TestBed.inject(ThemePreferenceStore);
    themes.set('light');
    TestBed.tick();
    expect(themes.preference()).toBe('light');
  });

  it('resolves System to the OS scheme, and follows it when it changes', () => {
    const move = osScheme(true);
    const { themes } = store();
    expect(themes.resolved()).toBe('dark');
    move(false);
    expect(themes.resolved()).toBe('light');
    themes.set('dark');
    expect(themes.resolved()).toBe('dark');
  });

  it('uses System and still switches for the visit when the storage throws', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
    }
    const { themes } = store();
    expect(themes.preference()).toBe('system');
    themes.set('dark');
    expect(themes.preference()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    themes.set('system');
    expect(themes.preference()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
