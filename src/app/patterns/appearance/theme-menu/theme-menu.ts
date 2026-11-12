import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemePreferenceStore } from '$core/appearance/theme-preference';
import { ThemeChoices } from '$patterns/appearance/theme-choices/theme-choices';
import { Dropdown } from '$ui/components/dropdown/dropdown';

/**
 * The top bar's theme menu (qits-2086): System, Light or Dark, its panel the `app-theme-choices`
 * radios bound to `ThemePreferenceStore`. Shown with or without an open project, because the scheme is the
 * browser's, not a project's (the shell leaves it out below 768px, where the bar has no room, and offers the same radios at
 * the foot of its navigation instead).
 *
 * The button's icon is the preference (a monitor for System, a sun for Light, a moon for Dark), not
 * the scheme it resolves to: the server renders System, and the stored choice is learnt only after
 * the first render, so the server's markup and the hydrated one agree. The button and the panel
 * are `ui-dropdown`'s.
 */
@Component({
  selector: 'app-theme-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, ThemeChoices],
  host: { class: 'inline-flex' },
  template: `
    <ui-dropdown align="start" label="Theme" panelLabel="Theme" panelId="theme-menu">
      <svg
        dropdown-trigger
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        [attr.data-preference]="themes.preference()"
      >
        @switch (themes.preference()) {
          @case ('light') {
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
            />
          }
          @case ('dark') {
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
          }
          @default {
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          }
        }
      </svg>
      <app-theme-choices dropdown-panel class="px-3 py-2" name="theme-menu" />
    </ui-dropdown>
  `,
})
export class ThemeMenu {
  protected readonly themes = inject(ThemePreferenceStore);
}
