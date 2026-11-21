import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { PROJECT_REPOSITORY_NAMES } from '$core/repositories/repositories.operations';

/** At most this many matches show below the field. */
export const SEARCH_MATCHES = 10;

/** A repository the search can open: its id (the entity's key) and its name. */
export interface SearchedRepository {
  readonly id?: string;
  readonly name?: string;
}

/**
 * The repositories whose name holds `text`, ignoring case, in their order; none for an empty text
 * (only spaces count as empty), and at most `SEARCH_MATCHES`.
 */
export function matchRepositories(
  repositories: readonly SearchedRepository[],
  text: string,
): readonly SearchedRepository[] {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return [];
  return repositories
    .filter((repository) => (repository.name ?? '').toLowerCase().includes(wanted))
    .slice(0, SEARCH_MATCHES);
}

/**
 * The Components section's Search (qits-2491): a field in the sidebar, the section's first entry
 * while it is open. Typing shows a list of the open project's repositories whose name holds the
 * text, ignoring case (`matchRepositories`); the arrow keys move through it, Enter or a click opens
 * that repository's page (`open-component-search`, `projects/:slug/components/:repo`), and Escape
 * closes it. It is an ARIA combobox: the field owns the list (`aria-controls`), and the active
 * option is the field's `aria-activedescendant`, so focus stays in the field.
 *
 * It reads the project's repositories (`PROJECT_REPOSITORY_NAMES`, `search-components`) once the
 * field is first focused or typed in, in the browser only, never on a page render: the sidebar
 * sits on every page of the section. What it lists is that read's data, marked (qits-2141).
 */
@Component({
  selector: 'app-component-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsEntity, QitsEntityList, QitsExit, QitsField],
  host: { class: 'relative block' },
  template: `
    <input
      type="search"
      class="block w-full rounded-md border border-line bg-surface px-3 py-[0.3rem] text-sm text-fg placeholder:text-fg-muted"
      role="combobox"
      aria-label="Search components"
      placeholder="Search"
      autocomplete="off"
      aria-autocomplete="list"
      [attr.aria-expanded]="open()"
      aria-controls="component-search-list"
      [attr.aria-activedescendant]="activeId()"
      [value]="text()"
      (focus)="asked.set(true)"
      (input)="typed($event)"
      (keydown)="key($event)"
      (blur)="close()"
    />
    <ul
      id="component-search-list"
      role="listbox"
      aria-label="Matching components"
      class="absolute inset-x-0 top-full z-10 m-0 mt-1 max-h-72 list-none overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg"
      [class.hidden]="!open()"
      [qitsEntityList]="repositories"
    >
      @for (repository of matches(); track repository.id; let i = $index) {
        <li [qitsEntity]="repository" entityKey="id">
          <a
            role="option"
            [id]="'component-search-' + i"
            [attr.aria-selected]="i === active()"
            class="block truncate rounded px-2 py-1 font-mono text-xs text-fg-soft no-underline hover:bg-surface-muted aria-selected:bg-surface-active aria-selected:text-fg"
            [qitsExit]="search.opened"
            [exitParams]="{ slug: slug(), repo: repository.name ?? '' }"
            [exitCurrent]="null"
            [fieldOf]="repository"
            qitsField="name"
            (mousedown)="$event.preventDefault()"
            (click)="close()"
            >{{ repository.name }}</a
          >
        </li>
      } @empty {
        <li class="px-2 py-1 text-xs text-fg-muted" data-no-match>
          {{ loading() ? 'Reading the components…' : 'No component matches.' }}
        </li>
      }
    </ul>
  `,
})
export class ComponentSearch {
  private readonly selected = inject(SelectedProject);

  /** A match opens its repository's page (qits-2491). */
  protected readonly search = outcomes('open-component-search', {
    opened: exit('projects/:slug/components/:repo'),
  });

  /** The open project's slug, the exit's param. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** Whether the field was focused or typed in: nothing is read before. */
  protected readonly asked = signal(false);

  /** The project's repositories, from the first focus on. */
  protected readonly repositories = qitsResource(PROJECT_REPOSITORY_NAMES, () => {
    const projectId = this.selected.project()?.id;
    return this.asked() && projectId ? { path: { projectId } } : undefined;
  });

  /** What is typed. */
  protected readonly text = signal('');

  /** Whether the list shows: something is typed, and Escape or leaving the field did not close it. */
  private readonly shown = signal(false);

  /** The highlighted match's index; -1 for none. */
  protected readonly active = signal(-1);

  /** The repositories the text matches. */
  protected readonly matches = computed(() =>
    matchRepositories(
      this.repositories.hasValue()
        ? (this.repositories.value()?.entries ?? []).flatMap((entry) =>
            entry.repository ? [entry.repository] : [],
          )
        : [],
      this.text(),
    ),
  );

  /** Whether the read has not answered yet. */
  protected readonly loading = computed(() => this.repositories.isLoading());

  protected readonly open = computed(() => this.shown() && this.text().trim() !== '');

  /** The highlighted option's element id, for `aria-activedescendant`. */
  protected readonly activeId = computed(() =>
    this.open() && this.active() >= 0 ? `component-search-${this.active()}` : null,
  );

  protected typed(event: Event): void {
    this.asked.set(true);
    this.text.set((event.target as HTMLInputElement).value);
    this.shown.set(true);
    this.active.set(-1);
  }

  protected key(event: KeyboardEvent): void {
    const count = this.matches().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.shown.set(true);
        if (count) this.active.update((i) => (i + 1) % count);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.shown.set(true);
        if (count) this.active.update((i) => (i <= 0 ? count - 1 : i - 1));
        return;
      case 'Enter': {
        const chosen = this.matches()[this.active() >= 0 ? this.active() : 0];
        if (!this.open() || !chosen?.name) return;
        event.preventDefault();
        this.close();
        void this.search.opened.go({ slug: this.slug(), repo: chosen.name });
        return;
      }
      case 'Escape':
        if (!this.open()) return;
        event.preventDefault();
        this.close();
        return;
    }
  }

  /**
   * Closes the list; the text stays. Leaving the field closes it too: an option's own press keeps
   * the focus in the field (its `mousedown`), so its click still lands.
   */
  protected close(): void {
    this.shown.set(false);
    this.active.set(-1);
  }
}
