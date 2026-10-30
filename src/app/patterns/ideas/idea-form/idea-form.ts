import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  descriptionLength,
  MAX_DESCRIPTION,
  MAX_PARAGRAPHS,
  paragraphCount,
  titleProblems,
} from '$core/ideas/idea-rules';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** What the form holds: a title, a description and the idea enabling it ('' for none). */
export interface IdeaFormValue {
  readonly title: string;
  readonly description: string;
  readonly enabledBy: string;
}

/** An idea the form offers as the one enabling this one. */
export interface IdeaOption {
  readonly id?: string;
  readonly title?: string;
}

const EMPTY: IdeaFormValue = { title: '', description: '', enabledBy: '' };

/**
 * The idea form (epic qits-888), for a new idea and an edit: a title, a description and the idea
 * enabling it (one of the project's other ideas, or none).
 *
 * While it is typed it counts what qits-projects counts (`$core/ideas/idea-rules.ts`): the
 * description's paragraphs (`x/3`) and characters (`x/600`), red past the limit, and what is wrong
 * with the title. It blocks nothing but a blank title: the service decides, and its refusal (the
 * 400's `message`, handed in as `refusal`) shows below the buttons with the typed form kept, to be
 * fixed and sent again.
 *
 * `initial` fills the form (the edit's idea), once it is given. `submitted` hands the typed value;
 * the page sends it and sets `busy` while it is on its way.
 */
@Component({
  selector: 'app-idea-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <form class="flex max-w-2xl flex-col gap-4" (submit)="$event.preventDefault(); submit()">
      <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
        Title
        <input
          class="h-8 w-full rounded-md border border-charcoal-brown-300 px-2 text-sm"
          type="text"
          name="title"
          aria-label="Title"
          [value]="title()"
          (input)="title.set(text($event))"
        />
        @for (problem of titleHints(); track problem) {
          <span class="text-xs text-cinnabar-700" data-title-hint>{{ problem }}</span>
        }
      </label>
      <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
        Description
        <textarea
          class="min-h-32 w-full rounded-md border border-charcoal-brown-300 p-2 text-sm"
          name="description"
          aria-label="Description"
          [value]="description()"
          (input)="description.set(text($event))"
        ></textarea>
        <span class="flex gap-4 text-xs text-charcoal-brown-600">
          <span
            data-paragraphs
            [class.text-cinnabar-700]="paragraphs() > maxParagraphs"
            title="Paragraphs are blocks separated by a blank line"
            >{{ paragraphs() }}/{{ maxParagraphs }} paragraphs</span
          >
          <span data-characters [class.text-cinnabar-700]="characters() > maxCharacters"
            >{{ characters() }}/{{ maxCharacters }} characters</span
          >
        </span>
      </label>
      <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
        Enabled by
        <select
          class="h-8 w-full max-w-md rounded-md border border-charcoal-brown-300 px-2 text-sm"
          name="enabledBy"
          aria-label="Enabled by"
          [value]="enabledBy()"
          (change)="enabledBy.set(text($event))"
        >
          <option value="">No idea</option>
          @for (option of options(); track option.id) {
            <option [value]="option.id" [selected]="option.id === enabledBy()">
              {{ option.title }}
            </option>
          }
        </select>
      </label>
      <div class="flex justify-end gap-2">
        <ui-action-button [action]="cancelAction()" />
        <ui-action-button [action]="submitAction()" />
      </div>
      @if (refusal(); as refusal) {
        <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ refusal }}</p>
      }
    </form>
  `,
})
export class IdeaForm {
  /** The value the form starts from; applied whenever a new one is handed in. */
  readonly initial = input<IdeaFormValue>(EMPTY);
  /** The ideas that can enable this one (the page leaves the idea itself out). */
  readonly options = input<readonly IdeaOption[]>([]);
  readonly submitLabel = input('Create');
  /** A send is on its way: the buttons wait. */
  readonly busy = input(false);
  /** Why the service refused the last send, in its words. */
  readonly refusal = input<string | null>(null);

  readonly submitted = output<IdeaFormValue>();
  readonly cancelled = output<void>();

  protected readonly maxParagraphs = MAX_PARAGRAPHS;
  protected readonly maxCharacters = MAX_DESCRIPTION;

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly enabledBy = signal('');

  protected readonly paragraphs = computed(() => paragraphCount(this.description()));
  protected readonly characters = computed(() => descriptionLength(this.description()));
  /** The title's problems once something is typed; a blank title only disables Create. */
  protected readonly titleHints = computed(() =>
    this.title().trim() ? titleProblems(this.title()) : [],
  );

  protected readonly submitAction = computed((): Action => ({
    label: this.busy() ? 'Saving…' : this.submitLabel(),
    variant: 'success',
    disabled: this.busy() || !this.title().trim(),
    callback: () => this.submit(),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => this.cancelled.emit(),
  }));

  constructor() {
    effect(() => {
      const value = this.initial();
      untracked(() => {
        this.title.set(value.title);
        this.description.set(value.description);
        this.enabledBy.set(value.enabledBy);
      });
    });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected submit(): void {
    if (this.busy() || !this.title().trim()) return;
    this.submitted.emit({
      title: this.title(),
      description: this.description(),
      enabledBy: this.enabledBy(),
    });
  }
}
