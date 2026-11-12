import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  DestroyRef,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
  type Signal,
} from '@angular/core';

/**
 * The colour scheme the user chose (qits-2086): `system`, follow the OS (`prefers-color-scheme`);
 * `light` or `dark`, that one whatever the OS says.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * The `localStorage` key holding a forced scheme, `light` or `dark`. System is the key removed.
 * `src/index.html` reads it too, before the first paint, so a forced scheme never flashes the
 * other one.
 */
export const THEME_PREFERENCE_KEY = 'qits.appearance.theme';

/** The preference where none is stored, the stored one is unknown, or there is no storage. */
const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/** The values the key may hold: the forced schemes. */
const FORCED: ReadonlySet<string> = new Set<ThemePreference>(['light', 'dark']);

/** The OS's answer, as `matchMedia` gives it. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

function storage(document: Document): Storage | undefined {
  try {
    return document.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The app's colour scheme setting, per browser (not per account): the top bar's theme menu shows
 * and switches it.
 *
 * `@qits/ui-components/theme.css` decides the scheme from `data-theme` on `<html>`: absent, the OS's
 * (`prefers-color-scheme`); `light` or `dark`, that one. {@link set} sets or removes the attribute
 * and keeps the choice in `localStorage` under {@link THEME_PREFERENCE_KEY} (System removes the
 * key). The inline script in `src/index.html` applies a stored choice before the first paint; this
 * store only learns it.
 *
 * Every read and write is guarded: with no storage, or a storage that throws, System applies and
 * switching still works for the visit. An unknown stored value reads as System. The server render
 * always says System; the stored value is read in the browser only after the first render
 * (`afterNextRender`), so hydration never meets a menu drawn another way than the server drew it.
 */
@Injectable({ providedIn: 'root' })
export class ThemePreferenceStore {
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  /** Whether the OS prefers dark: live in the browser, `false` on the server and without `matchMedia`. */
  private readonly systemDark = signal(false);
  private chosen = false;

  /** The preference in use. */
  readonly preference: Signal<ThemePreference> = this.current.asReadonly();

  /** The scheme in effect: the forced one, or for System the OS's (`light` on the server). */
  readonly resolved: Signal<'light' | 'dark'> = computed(() => {
    const preference = this.current();
    if (preference !== 'system') return preference;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.followSystem();
    // A choice made before the first render ends wins over what was stored.
    afterNextRender(() => {
      if (!this.chosen) this.current.set(this.stored());
    });
  }

  /**
   * Uses `preference` at once (sets or removes `data-theme` on `<html>`) and keeps it for the next
   * visit, when the browser lets it.
   */
  set(preference: ThemePreference): void {
    this.chosen = true;
    this.current.set(preference);
    const root = this.document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
    try {
      const store = storage(this.document);
      if (preference === 'system') store?.removeItem(THEME_PREFERENCE_KEY);
      else store?.setItem(THEME_PREFERENCE_KEY, preference);
    } catch {
      // Storage blocked or full: the scheme still holds for this visit.
    }
  }

  /** The stored preference, or System for none, an unknown one or no storage. */
  private stored(): ThemePreference {
    try {
      const value = storage(this.document)?.getItem(THEME_PREFERENCE_KEY);
      return value && FORCED.has(value) ? (value as ThemePreference) : DEFAULT_THEME_PREFERENCE;
    } catch {
      return DEFAULT_THEME_PREFERENCE;
    }
  }

  /** Tracks the OS's scheme, where the browser answers `matchMedia`. */
  private followSystem(): void {
    const query = this.document.defaultView?.matchMedia?.(DARK_QUERY);
    if (!query) return;
    this.systemDark.set(query.matches);
    const changed = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
    query.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', changed));
  }
}
