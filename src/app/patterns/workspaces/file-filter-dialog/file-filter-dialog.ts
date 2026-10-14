import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  PREVIEW_LIMIT,
  type FilterPreview,
  type FilterRule,
  type MatchKind,
  type RuleMode,
} from '$core/workspaces/file-filter-rules';

/** One generated rule set the dialog shows read-only: a framework, or an ignore list. */
export interface GeneratedSet {
  /** The key the toggle emits. */
  readonly id: string;
  /** What it is called: a framework's label, or an ignore file's basename. */
  readonly name: string;
  readonly on: boolean;
  /** Said beside the name: "3 paths under the root", "1 file in the tree". */
  readonly note: string;
  /** The rules it generated, in evaluation order, as text. */
  readonly rules: readonly string[];
}

/** A small bordered button, written out in full so Tailwind finds it. */
const SMALL =
  'cursor-pointer rounded border border-charcoal-brown-200 bg-white px-1.5 py-0.5 font-sans text-xs text-charcoal-brown-600 disabled:cursor-default disabled:text-charcoal-brown-300';

/**
 * The Files tab's advanced filter (epic qits-1230), ported from qits-workspaces-frontend's: an
 * ordered list of manual rules, the generated sets under it, and a live preview.
 *
 * Rules run top to bottom and the last that matches wins, as in a `.gitignore`: so the rows are
 * ordered, can be moved, and a disabled row keeps its place. The generated sets run first in a
 * fixed order (framework, then ignore list), so a manual `show` can always bring back a file they
 * hid. It decides nothing itself: every change goes out as an output.
 */
@Component({
  selector: 'app-file-filter-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-2 rounded-md border border-charcoal-brown-300 bg-charcoal-brown-50 p-3 text-sm"
      role="dialog"
      aria-label="Advanced file filter"
    >
      <header class="flex items-baseline justify-between gap-3">
        <h3 class="m-0 text-sm font-semibold text-charcoal-brown-900">Filter rules</h3>
        <button type="button" [class]="small" (click)="closed.emit()">Done</button>
      </header>

      <p class="m-0 text-xs text-charcoal-brown-600">
        Rules run top to bottom and the <strong>last one that matches wins</strong>, the way a
        <code>.gitignore</code> does. The generated sets below run first (framework, then ignore
        list), so a <em>show</em> rule up here can always bring back a file they hid.
      </p>

      <ol class="m-0 flex list-none flex-col gap-1 p-0">
        @for (rule of rules(); track rule.id; let index = $index; let last = $last) {
          <li class="flex items-center gap-1.5">
            <input
              type="checkbox"
              [attr.aria-label]="'Enable rule ' + (index + 1)"
              [checked]="rule.enabled"
              (change)="patch(index, { enabled: !rule.enabled })"
            />
            <select
              class="rounded border border-charcoal-brown-300 bg-white px-1 py-0.5 text-xs"
              [attr.aria-label]="'Rule ' + (index + 1) + ' mode'"
              [value]="rule.mode"
              (change)="patch(index, { mode: modeOf($event) })"
            >
              <option value="show">show</option>
              <option value="hide">hide</option>
            </select>
            <select
              class="rounded border border-charcoal-brown-300 bg-white px-1 py-0.5 text-xs"
              [attr.aria-label]="'Rule ' + (index + 1) + ' match'"
              [value]="rule.kind"
              (change)="patch(index, { kind: kindOf($event) })"
            >
              <option value="fuzzy">fuzzy</option>
              <option value="includes">includes</option>
              <option value="exact">exact</option>
            </select>
            <input
              type="text"
              class="min-w-24 grow rounded border border-charcoal-brown-300 bg-white px-1.5 py-0.5 text-xs"
              autocomplete="off"
              spellcheck="false"
              placeholder="a name, or a path with a /"
              [attr.aria-label]="'Rule ' + (index + 1) + ' query'"
              [value]="rule.query"
              (input)="patch(index, { query: valueOf($event) })"
            />
            <button
              type="button"
              [class]="small"
              [disabled]="index === 0"
              [attr.aria-label]="'Move rule ' + (index + 1) + ' earlier'"
              (click)="move(index, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              [class]="small"
              [disabled]="last"
              [attr.aria-label]="'Move rule ' + (index + 1) + ' later'"
              (click)="move(index, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              [class]="small"
              [attr.aria-label]="'Remove rule ' + (index + 1)"
              (click)="remove(index)"
            >
              ✕
            </button>
          </li>
        }
      </ol>
      <div>
        <button type="button" [class]="small" (click)="add()">Add a rule</button>
      </div>

      @if (frameworkSets().length > 0 || ignoreSets().length > 0) {
        <h4 class="m-0 mt-2 text-xs font-semibold tracking-wide text-charcoal-brown-600 uppercase">
          Generated sets
        </h4>
        @for (set of frameworkSets(); track set.id) {
          <details class="text-xs">
            <summary class="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                [attr.aria-label]="'Restrict to ' + set.name"
                [checked]="set.on"
                (change)="toggleFramework.emit(set.id)"
              />
              <span class="font-semibold">{{ set.name }}</span>
              <span class="text-charcoal-brown-600">framework · {{ set.note }}</span>
            </summary>
            <ul class="my-1 ml-6 list-none p-0 font-mono text-charcoal-brown-700">
              @for (line of set.rules; track $index) {
                <li>{{ line }}</li>
              }
            </ul>
          </details>
        }
        @for (set of ignoreSets(); track set.id) {
          <details class="text-xs">
            <summary class="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                [attr.aria-label]="'Apply ' + set.name"
                [checked]="set.on"
                (change)="toggleIgnore.emit(set.id)"
              />
              <span class="font-semibold">{{ set.name }}</span>
              <span class="text-charcoal-brown-600">ignore list · {{ set.note }}</span>
            </summary>
            <ul class="my-1 ml-6 list-none p-0 font-mono text-charcoal-brown-700">
              @if (set.on && set.rules.length === 0) {
                <li class="font-sans text-charcoal-brown-600">Reading the ignore files…</li>
              }
              @for (line of set.rules; track $index) {
                <li>{{ line }}</li>
              }
            </ul>
          </details>
        }
      }

      <h4 class="m-0 mt-2 text-xs font-semibold tracking-wide text-charcoal-brown-600 uppercase">
        Preview
      </h4>
      <p class="m-0 text-xs" role="status">
        {{ preview().total }} {{ preview().total === 1 ? 'file' : 'files' }} visible.
        @if (preview().truncated) {
          <span class="text-charcoal-brown-600">Showing the first {{ limit }}.</span>
        }
      </p>
      @if (preview().total === 0) {
        <p class="m-0 text-xs text-charcoal-brown-600">Nothing matches these rules.</p>
      } @else {
        <ul
          class="m-0 max-h-48 list-none overflow-auto rounded border border-charcoal-brown-200 bg-white px-2 py-1 font-mono text-xs"
        >
          @for (path of preview().paths; track path) {
            <li>{{ path }}</li>
          }
        </ul>
      }
    </section>
  `,
})
export class FileFilterDialog {
  /** The manual rules, in evaluation order. */
  readonly rules = input.required<readonly FilterRule[]>();

  /** The framework whitelists, which run first. */
  readonly frameworkSets = input<readonly GeneratedSet[]>([]);

  /** The ignore lists, which run between the frameworks and the manual rules. */
  readonly ignoreSets = input<readonly GeneratedSet[]>([]);

  /** What the rules show now, already capped by the model. */
  readonly preview = input.required<FilterPreview>();

  readonly rulesChange = output<readonly FilterRule[]>();
  readonly toggleFramework = output<string>();
  readonly toggleIgnore = output<string>();
  readonly closed = output<void>();

  protected readonly limit = PREVIEW_LIMIT;
  protected readonly small = SMALL;
  private added = 0;

  /** A new rule goes last, where it has the last word. */
  protected add(): void {
    this.added += 1;
    const rule: FilterRule = {
      id: `rule-${this.added}-${this.rules().length}`,
      kind: 'fuzzy',
      query: '',
      mode: 'hide',
      enabled: true,
    };
    this.rulesChange.emit([...this.rules(), rule]);
  }

  protected patch(index: number, change: Partial<FilterRule>): void {
    this.rulesChange.emit(
      this.rules().map((rule, at) => (at === index ? { ...rule, ...change } : rule)),
    );
  }

  protected remove(index: number): void {
    this.rulesChange.emit(this.rules().filter((_, at) => at !== index));
  }

  /** Swap one row with its neighbour; the order is the meaning, so nothing else moves. */
  protected move(index: number, by: number): void {
    const to = index + by;
    if (to < 0 || to >= this.rules().length) return;
    const next = [...this.rules()];
    [next[index], next[to]] = [next[to], next[index]];
    this.rulesChange.emit(next);
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected modeOf(event: Event): RuleMode {
    return (event.target as HTMLSelectElement).value as RuleMode;
  }

  protected kindOf(event: Event): MatchKind {
    return (event.target as HTMLSelectElement).value as MatchKind;
  }
}
