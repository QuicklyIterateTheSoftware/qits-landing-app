import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
  QitsTriggers,
  stay,
} from '@qits/angular';
import { map } from 'rxjs';
import { loadState } from '$core/resources/load-state';
import { explainToggleRefusal, toggleRefusalOf } from '$core/toggles/toggle-refusals';
import {
  draftsOf,
  movedRule,
  namedSubjects,
  newRule,
  sentRules,
  withoutRule,
  withRule,
  withSubject,
  type NamedSubject,
  type RuleDraft,
} from '$core/toggles/toggle-rules';
import type { UserSubject } from '$core/idp/user-subjects.consumes';
import { USER_SUBJECTS } from '$core/idp/user-subjects.operations';
import type { ToggleDetail } from '$core/toggles/toggles.consumes';
import { TOGGLE_DETAIL, TOGGLE_RULES_SAVE } from '$core/toggles/toggles.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A save's refusal as the editor shows it: what was said, and the rule it names (400). */
interface Refused {
  readonly status: number;
  readonly said: string;
  readonly position?: number;
}

/**
 * One toggle's rule editor (qits-2704), at `/toggles/:slug`, opened from the Toggles list.
 *
 * **Load budget: 2**, both read in the browser only:
 * - `TOGGLE_DETAIL` (`getToggle`): the toggle, its ordered rules and the version a save names. An
 *   undeclared slug (404) says so.
 * - `USER_SUBJECTS` (`listUserSubjects`, qits-idp, qits-2725): the people a USER rule can name,
 *   each account's subject and username. qits:admin or the delivery desk; refused (403) or failed,
 *   the picker is hidden and one line says to type the ids. It never blocks the page or a save.
 *
 * The rules are an ordered list, the first that matches deciding, each with its own on/off value:
 * - **User**: the bearer subjects it matches. **Add a person** picks one by username and appends
 *   their subject; each subject that is an account is named under the rule, any other (an agent's
 *   `tok-…`, a service client, a deleted user) shown as its id. The subjects stay typed text too,
 *   the fallback for anyone the picker does not list;
 * - **Time**: from an instant on (ISO-8601, UTC);
 * - **Default**: the one STATIC rule, always last; it cannot be removed or moved, only its value
 *   changes.
 *
 * User and time rules are added before the default, removed, and moved up and down, in a draft;
 * **Save** (`save-toggle-rules`) sends the whole list with the version it was read at. Refusals:
 * 409 says someone else changed the rules and offers Reload (`reload-toggle-rules`); 400 is shown
 * beside the rule it names (`position`), or above the list; 403 says changing rules needs
 * qits:admin or the delivery desk. There is no create and no delete control.
 */
@Component({
  selector: 'app-toggle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    QitsTriggers,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[56rem] px-6 pt-8 pb-12">
      <p class="mt-0 mb-2 text-sm">
        <a class="text-accent no-underline hover:underline" [qitsExit]="back.list">← Toggles</a>
      </p>
      <app-page-layout [title]="slug()">
        @if (missing()) {
          <p
            role="status"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            No toggle is declared as “{{ slug() }}”. A toggle exists only by its declaration in
            qits-toggles-service’s code.
          </p>
        } @else {
          <ui-load-failure
            message="The toggle cannot be read right now."
            [class.hidden]="state() !== 'error'"
            (retry)="toggle.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (detail(); as toggle) {
              <div [qitsEntity]="toggle" entityKey="slug">
                <p
                  class="mt-0 mb-1 text-sm text-fg-soft"
                  [fieldOf]="toggle"
                  qitsField="description"
                >
                  {{ toggle.description }}
                </p>
                <p class="mt-0 mb-4 text-xs text-fg-muted">
                  Declared default
                  <span [fieldOf]="toggle" [qitsField]="marks.declaredDefault">{{
                    toggle.declaredDefault ? 'on' : 'off'
                  }}</span>
                  · version <span [fieldOf]="toggle" qitsField="version">{{ toggle.version }}</span>
                  · the first rule that matches decides.
                </p>
              </div>

              @if (refused(); as refusal) {
                @if (refusal.position === undefined) {
                  <div
                    role="alert"
                    class="mb-3 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-fg"
                  >
                    {{ refusal.said }}
                    @if (refusal.status === 409) {
                      <button
                        type="button"
                        class="ml-2 font-medium text-accent hover:underline"
                        [qitsTriggers]="[reloading.reloaded]"
                        (click)="reload()"
                      >
                        Reload
                      </button>
                    }
                  </div>
                }
              }
              @if (saved()) {
                <p role="status" class="mt-0 mb-3 text-sm text-success">Saved.</p>
              }

              <ol class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Rules">
                @for (rule of drafts(); track $index; let i = $index, last = $last) {
                  <li
                    class="rounded-md border border-line px-3 py-2"
                    [attr.aria-label]="label(rule, i)"
                  >
                    <div class="flex flex-wrap items-center gap-2 text-sm">
                      <span class="w-16 font-semibold">{{ kindLabel(rule) }}</span>
                      @switch (rule.kind) {
                        @case ('USER') {
                          <div class="flex flex-1 flex-col gap-1">
                            @if (people().length) {
                              <label class="flex flex-col text-xs text-fg-muted">
                                Add a person
                                <select
                                  class="mt-1 rounded border border-line bg-surface px-1 py-0.5 text-sm text-fg"
                                  [qitsEntityList]="subjects"
                                  [qitsTriggers]="[editing.changed]"
                                  (change)="pick(i, $event)"
                                >
                                  <option value="">Choose a person…</option>
                                  @for (person of people(); track person.subject) {
                                    <option
                                      [value]="person.subject"
                                      [qitsEntity]="person"
                                      entityKey="subject"
                                      [fieldOf]="person"
                                      qitsField="username"
                                    >
                                      {{ person.username }}
                                    </option>
                                  }
                                </select>
                              </label>
                            } @else if (peopleRefused()) {
                              <p class="m-0 text-xs text-fg-muted">
                                People cannot be listed with this sign-in; type their ids.
                              </p>
                            }
                            @if (named(rule); as ruleSubjects) {
                              @if (ruleSubjects.length) {
                                <p
                                  class="m-0 flex flex-wrap gap-x-3 gap-y-1 text-sm"
                                  [attr.aria-label]="'Subjects of rule ' + (i + 1)"
                                >
                                  @for (one of ruleSubjects; track one.subject) {
                                    <span data-subject>
                                      @if (one.username) {
                                        <span class="text-fg">{{ one.username }}</span>
                                        &ngsp;<span class="ml-1 font-mono text-xs text-fg-muted">{{
                                          one.subject
                                        }}</span>
                                      } @else {
                                        <span class="font-mono text-fg">{{ one.subject }}</span>
                                        @if (people().length) {
                                          &ngsp;<span class="ml-1 text-xs text-fg-muted"
                                            >not a person: an agent, a service client or a deleted
                                            user</span
                                          >
                                        }
                                      }
                                    </span>
                                  }
                                </p>
                              }
                            }
                            <label class="flex flex-col text-xs text-fg-muted">
                              Or type subjects (user ids, tok-… agent subjects, client ids)
                              <textarea
                                rows="2"
                                class="mt-1 rounded border border-line bg-surface px-2 py-1 font-mono text-sm text-fg"
                                [value]="rule.subjects"
                                [qitsTriggers]="[editing.changed]"
                                (input)="change(i, { subjects: text($event) })"
                              ></textarea>
                            </label>
                          </div>
                        }
                        @case ('TIME') {
                          <label class="flex flex-1 flex-col text-xs text-fg-muted">
                            From (ISO-8601, UTC)
                            <input
                              type="text"
                              class="mt-1 rounded border border-line bg-surface px-2 py-1 font-mono text-sm text-fg"
                              placeholder="2026-12-01T00:00:00Z"
                              [value]="rule.after"
                              [qitsTriggers]="[editing.changed]"
                              (input)="change(i, { after: text($event) })"
                            />
                          </label>
                        }
                        @default {
                          <span class="flex-1 text-xs text-fg-muted"
                            >when nothing above matches</span
                          >
                        }
                      }
                      <label class="flex items-center gap-1 text-xs text-fg-muted">
                        answers
                        <select
                          class="rounded border border-line bg-surface px-1 py-0.5 text-sm text-fg"
                          [value]="rule.value ? 'on' : 'off'"
                          [qitsTriggers]="[editing.changed]"
                          (change)="change(i, { value: text($event) === 'on' })"
                        >
                          <option value="on">on</option>
                          <option value="off">off</option>
                        </select>
                      </label>
                      @if (!last) {
                        <span class="flex gap-1">
                          <button
                            type="button"
                            class="rounded border border-line px-1.5 text-xs disabled:opacity-40"
                            [disabled]="i === 0"
                            [qitsTriggers]="[editing.moved]"
                            (click)="move(i, -1)"
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            class="rounded border border-line px-1.5 text-xs disabled:opacity-40"
                            [disabled]="i === drafts().length - 2"
                            [qitsTriggers]="[editing.moved]"
                            (click)="move(i, 1)"
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            class="rounded border border-line px-1.5 text-xs text-danger"
                            [qitsTriggers]="[editing.removed]"
                            (click)="remove(i)"
                          >
                            Remove
                          </button>
                        </span>
                      }
                    </div>
                    @if (refused()?.position === i) {
                      <p role="alert" class="mt-1 mb-0 text-sm text-danger">
                        {{ refused()?.said }}
                      </p>
                    }
                  </li>
                }
              </ol>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded border border-line px-2 py-1 text-sm"
                  [qitsTriggers]="[editing.added]"
                  (click)="add('USER')"
                >
                  Add user rule
                </button>
                <button
                  type="button"
                  class="rounded border border-line px-2 py-1 text-sm"
                  [qitsTriggers]="[editing.added]"
                  (click)="add('TIME')"
                >
                  Add time rule
                </button>
                <span class="flex-1"></span>
                <ui-action-button [action]="saveAction()" />
              </div>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class TogglePage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  protected readonly back = outcomes('back-to-toggles', { list: exit('toggles') });
  protected readonly editing = outcomes('edit-toggle-rules', {
    added: stay(),
    removed: stay(),
    moved: stay(),
    changed: stay(),
  });
  protected readonly saving = outcomes('save-toggle-rules', {
    saved: stay(),
    refused: stay(),
  });
  protected readonly reloading = outcomes('reload-toggle-rules', { reloaded: stay() });

  /** The URL's slug. */
  protected readonly slug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: '' },
  );

  /** The toggle; read again on Reload only (qits-toggles sends no event). */
  protected readonly toggle = qitsResource(TOGGLE_DETAIL, () =>
    this.browser && this.slug() ? { path: { slug: this.slug() } } : undefined,
  );

  /** The people a USER rule can name (qits-idp); refused or failed, the picker is hidden. */
  protected readonly subjects = qitsResource(USER_SUBJECTS, () => (this.browser ? {} : undefined));

  /** The listed people, by username as the idp sorts them; none until (or unless) it answers. */
  protected readonly people = computed((): readonly UserSubject[] =>
    this.subjects.hasValue()
      ? (this.subjects.value() ?? []).filter((person) => person.subject && person.username)
      : [],
  );

  /** The listing failed or was refused: the editor says to type the ids instead. */
  protected readonly peopleRefused = computed(() => this.subjects.error() !== undefined);

  /** subject → username, for naming a rule's subjects. */
  private readonly usernames = computed(
    () => new Map(this.people().map((person) => [person.subject!, person.username!])),
  );

  private readonly saveRun = qitsMutation(TOGGLE_RULES_SAVE, { offline: 'online-only' });

  /** The toggle as last read or saved; undefined until the read answers. */
  protected readonly detail = computed((): ToggleDetail | undefined =>
    this.toggle.hasValue() ? this.toggle.value() : undefined,
  );

  /** The undeclared slug: the read answered 404. */
  protected readonly missing = computed(() => {
    const error = this.toggle.error();
    return error instanceof QitsApiError && error.status === 404;
  });

  protected readonly state = computed((): LoadState => loadState(this.toggle));

  /** The version a save names: the read's, or the last save's. */
  private readonly version = signal<number | undefined>(undefined);

  /** The rules being edited, STATIC last. */
  protected readonly drafts = signal<RuleDraft[]>([]);

  protected readonly marks = MARKS;

  protected readonly busy = signal(false);
  protected readonly refused = signal<Refused | null>(null);
  protected readonly saved = signal(false);

  constructor() {
    // Each answer of the read (the first, and a Reload's) replaces the draft.
    effect(() => {
      const toggle = this.detail();
      if (!toggle) return;
      this.version.set(toggle.version);
      this.drafts.set(draftsOf(toggle.rules ?? [], toggle.declaredDefault ?? false));
    });
  }

  protected readonly saveAction = computed((): Action => ({
    label: this.busy() ? 'Saving…' : 'Save',
    variant: 'success',
    disabled: this.busy() || this.version() === undefined,
    outcomes: [this.saving.saved, this.saving.refused],
    callback: () => void this.save(),
  }));

  protected kindLabel(rule: RuleDraft): string {
    return rule.kind === 'USER' ? 'User' : rule.kind === 'TIME' ? 'Time' : 'Default';
  }

  protected label(rule: RuleDraft, index: number): string {
    return `Rule ${index + 1}: ${this.kindLabel(rule)}`;
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected add(kind: 'USER' | 'TIME'): void {
    this.drafts.update((drafts) => withRule(drafts, newRule(kind)));
    this.touched();
    this.editing.added.reach();
  }

  protected remove(index: number): void {
    this.drafts.update((drafts) => withoutRule(drafts, index));
    this.touched();
    this.editing.removed.reach();
  }

  protected move(index: number, by: -1 | 1): void {
    this.drafts.update((drafts) => movedRule(drafts, index, by));
    this.touched();
    this.editing.moved.reach();
  }

  protected change(index: number, change: Partial<RuleDraft>): void {
    this.drafts.update((drafts) =>
      drafts.map((draft, at) => (at === index ? { ...draft, ...change } : draft)),
    );
    this.touched();
    this.editing.changed.reach();
  }

  /** A USER rule's subjects, each named where it is a listed person. */
  protected named(rule: RuleDraft): NamedSubject[] {
    return namedSubjects(rule, this.usernames());
  }

  /** "Add a person": the chosen person's subject joins the rule's, and the picker resets. */
  protected pick(index: number, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const subject = select.value;
    select.value = '';
    if (!subject) return;
    this.drafts.update((drafts) =>
      drafts.map((draft, at) => (at === index ? withSubject(draft, subject) : draft)),
    );
    this.touched();
    this.editing.changed.reach();
  }

  protected reload(): void {
    this.refused.set(null);
    this.toggle.reload();
    this.reloading.reloaded.reach();
  }

  private touched(): void {
    this.saved.set(false);
  }

  protected async save(): Promise<void> {
    const version = this.version();
    if (version === undefined || this.busy()) return;
    this.busy.set(true);
    this.refused.set(null);
    this.saved.set(false);
    try {
      const answer = await this.saveRun.run({
        path: { slug: this.slug() },
        body: { version, rules: sentRules(this.drafts()) },
      });
      if (answer?.version !== undefined) this.version.set(answer.version);
      if (answer?.rules) {
        this.drafts.set(draftsOf(answer.rules, this.detail()?.declaredDefault ?? false));
      }
      this.saved.set(true);
      this.saving.saved.reach();
    } catch (failure) {
      const refusal = toggleRefusalOf(failure);
      this.refused.set({
        status: refusal.status,
        said: explainToggleRefusal(refusal),
        position: refusal.status === 400 ? refusal.position : undefined,
      });
      this.saving.refused.reach();
    } finally {
      this.busy.set(false);
    }
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  declaredDefault: { derived: ['declaredDefault'] },
} as const;
