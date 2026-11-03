import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import {
  CRITERION_KINDS,
  isCriterionKind,
  KIND_LABELS,
  newCriterion,
  newGroup,
  PREDICATE_FIELDS,
  type CriterionDraft,
  type GroupDraft,
  type PredicateField,
} from '$core/milestones/milestone-criteria';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * A milestone's condition, edited (epic qits-615): groups, any one of which meets the milestone
 * ("or"), each of criteria that must all hold ("and"). A criterion is a kind and its fields: a work
 * item reaching a status (`ENTITY_STATUS`: the item's qualified id and the status), an application
 * deployed (`DEPLOYMENT_ACTIVE`: its name, optionally an environment and a least version), a
 * repository released (`SCM_RELEASE`: its name, optionally a least version), or a person's
 * approval (`APPROVAL`, no fields; approved on the milestone's page). Groups and criteria are added
 * and removed here; the form around it sends `groupSpecs(groups)`.
 *
 * A criterion that came from the service keeps its id while its kind is unchanged, so the service
 * keeps its latch as long as its fields stay as they were. Changing a criterion's kind makes it a
 * new one.
 *
 * Controlled: `groups` is a two-way model the form owns.
 */
@Component({
  selector: 'app-milestone-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'flex flex-col gap-3' },
  template: `
    @for (group of groups(); track $index; let g = $index) {
      @if (g > 0) {
        <p class="m-0 text-xs font-semibold tracking-wide text-charcoal-brown-500 uppercase">or</p>
      }
      <fieldset
        class="m-0 flex flex-col gap-2 rounded-md border border-charcoal-brown-200 p-3"
        data-milestone-group
      >
        <legend class="px-1 text-sm font-semibold text-charcoal-brown-800">
          Group {{ g + 1 }}: every criterion holds
        </legend>
        @for (criterion of group.criteria; track $index; let c = $index) {
          @if (c > 0) {
            <p class="m-0 text-xs font-semibold tracking-wide text-charcoal-brown-500 uppercase">
              and
            </p>
          }
          <div class="flex flex-wrap items-end gap-2" data-milestone-criterion>
            <label class="flex flex-col gap-1 text-xs text-charcoal-brown-600">
              Kind
              <select
                class="h-8 rounded-md border border-charcoal-brown-300 px-2 text-sm text-charcoal-brown-900"
                [attr.aria-label]="'Group ' + (g + 1) + ', criterion ' + (c + 1) + ': kind'"
                (change)="setKind(g, c, value($event))"
              >
                @for (kind of kinds; track kind) {
                  <option [value]="kind" [selected]="kind === criterion.kind">
                    {{ kindLabel(kind) }}
                  </option>
                }
              </select>
            </label>
            @for (field of fieldsOf(criterion); track field.key) {
              <label class="flex flex-col gap-1 text-xs text-charcoal-brown-600">
                {{ field.label }}{{ field.required ? '' : ' (optional)' }}
                @if (field.options; as options) {
                  <select
                    class="h-8 rounded-md border border-charcoal-brown-300 px-2 text-sm text-charcoal-brown-900"
                    [attr.aria-label]="
                      'Group ' + (g + 1) + ', criterion ' + (c + 1) + ': ' + field.label
                    "
                    (change)="setField(g, c, field.key, value($event))"
                  >
                    @for (option of options; track option) {
                      <option [value]="option" [selected]="option === criterion.fields[field.key]">
                        {{ words(option) }}
                      </option>
                    }
                  </select>
                } @else {
                  <input
                    class="h-8 w-40 rounded-md border border-charcoal-brown-300 px-2 text-sm text-charcoal-brown-900"
                    [attr.aria-label]="
                      'Group ' + (g + 1) + ', criterion ' + (c + 1) + ': ' + field.label
                    "
                    [placeholder]="field.placeholder ?? ''"
                    [value]="criterion.fields[field.key] ?? ''"
                    (input)="setField(g, c, field.key, value($event))"
                  />
                }
              </label>
            }
            <ui-action-button [action]="removeCriterionAction(g, c)" />
          </div>
        }
        <div class="flex flex-wrap gap-2">
          <ui-action-button [action]="addCriterionAction(g)" />
          <ui-action-button [action]="removeGroupAction(g)" />
        </div>
      </fieldset>
    }
    <div><ui-action-button [action]="addGroupAction()" /></div>
  `,
})
export class MilestoneEditor {
  /** The condition being edited. */
  readonly groups = model.required<readonly GroupDraft[]>();
  /** No edits while the form sends. */
  readonly disabled = input(false);

  protected readonly kinds = CRITERION_KINDS;

  protected kindLabel(kind: string): string {
    return isCriterionKind(kind) ? KIND_LABELS[kind] : kind;
  }

  protected words(status: string): string {
    return status.toLowerCase().replaceAll('_', ' ');
  }

  protected fieldsOf(criterion: CriterionDraft): readonly PredicateField[] {
    return isCriterionKind(criterion.kind) ? PREDICATE_FIELDS[criterion.kind] : [];
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected setKind(g: number, c: number, kind: string): void {
    // A new kind is a new criterion: no id, so the service does not take it for the old one.
    this.update(g, (criteria) => criteria.map((x, i) => (i === c ? newCriterion(kind) : x)));
  }

  protected setField(g: number, c: number, key: string, value: string): void {
    this.update(g, (criteria) =>
      criteria.map((x, i) => (i === c ? { ...x, fields: { ...x.fields, [key]: value } } : x)),
    );
  }

  protected addCriterionAction(g: number): Action {
    return {
      label: 'And another criterion',
      variant: 'muted',
      disabled: this.disabled(),
      callback: () => this.update(g, (criteria) => [...criteria, newCriterion()]),
    };
  }

  protected removeCriterionAction(g: number, c: number): Action {
    return {
      label: 'Remove',
      variant: 'muted',
      disabled: this.disabled(),
      callback: () => this.update(g, (criteria) => criteria.filter((_, i) => i !== c)),
    };
  }

  protected removeGroupAction(g: number): Action {
    return {
      label: 'Remove group',
      variant: 'danger',
      disabled: this.disabled() || this.groups().length < 2,
      callback: () => this.groups.set(this.groups().filter((_, i) => i !== g)),
    };
  }

  protected addGroupAction(): Action {
    return {
      label: 'Or another group',
      variant: 'muted',
      disabled: this.disabled(),
      callback: () => this.groups.set([...this.groups(), newGroup()]),
    };
  }

  private update(
    g: number,
    change: (criteria: readonly CriterionDraft[]) => readonly CriterionDraft[],
  ): void {
    this.groups.set(
      this.groups().map((group, i) => (i === g ? { criteria: change(group.criteria) } : group)),
    );
  }
}
