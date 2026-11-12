import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ThemePreferenceStore, type ThemePreference } from '$core/appearance/theme-preference';

/** The choices, in the order they are listed. */
export const THEME_CHOICES: readonly {
  readonly preference: ThemePreference;
  readonly label: string;
}[] = [
  { preference: 'system', label: 'System' },
  { preference: 'light', label: 'Light' },
  { preference: 'dark', label: 'Dark' },
];

/**
 * The theme setting (qits-2086): a "Theme" fieldset of three radios, System, Light and Dark, bound
 * to `ThemePreferenceStore`. The top bar's theme menu shows it in its panel from 768px up; the
 * shell's navigation shows it at its foot below 768px, where the top bar has no room for the menu.
 *
 * `name` is the radio group's: each place gives its own, since two groups of one name on a page
 * would be one group.
 */
@Component({
  selector: 'app-theme-choices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset class="m-0 flex flex-col gap-1 border-0 p-0 text-sm">
      <legend class="mb-1 p-0 text-xs font-semibold text-fg-soft">Theme</legend>
      @for (choice of choices; track choice.preference) {
        <label class="flex cursor-pointer items-center gap-2 py-1 whitespace-nowrap text-fg">
          <input
            type="radio"
            class="m-0"
            [name]="name()"
            [value]="choice.preference"
            [checked]="themes.preference() === choice.preference"
            (change)="themes.set(choice.preference)"
          />
          {{ choice.label }}
        </label>
      }
    </fieldset>
  `,
})
export class ThemeChoices {
  /** The radio group's name, unique on the page. */
  readonly name = input.required<string>();

  protected readonly themes = inject(ThemePreferenceStore);
  protected readonly choices = THEME_CHOICES;
}
