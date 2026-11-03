import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MilestonesStore } from '$core/milestones/milestones.store';
import { milestonePath } from '$core/milestones/milestone-path';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore, workRef } from '$core/work/work.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { MilestoneNeeds } from '$patterns/milestones/milestone-needs/milestone-needs';

/**
 * A campaign's members and the milestones each membership needs (epic qits-615): a member is
 * dispatched once all of them are met. Each row: the member's id (linking its page) and title, a
 * "needs: <milestone>" mark for each one not met yet (`app-milestone-needs`), the met ones by name,
 * and "Set milestones", which opens a checklist of the project's milestones
 * (`MilestonesStore.loadList`, read on the first opening), ticked as the membership stands; Save
 * states them whole (`MilestonesStore.setMemberMilestones`). Once the service took it the project's
 * work is read again (`WorkStore.refresh`: the memberships come with it); a refusal shows in the
 * service's words.
 *
 * The memberships come from `SelectedWork` (the campaign's members read, `listWorkMembers`), so
 * they follow `MilestoneMet`/`MilestoneUnmet` with the project's work.
 */
@Component({
  selector: 'app-member-milestones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, MilestoneNeeds, RouterLink],
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-2 text-sm text-charcoal-brown-800"
      aria-label="Member milestones"
    >
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Member milestones</h2>
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        @for (row of rows(); track row.membershipId) {
          <li class="flex flex-col gap-1" data-member-milestones>
            <div class="flex flex-wrap items-center gap-2">
              <a
                class="font-mono text-xs text-ocean-deep-700 no-underline hover:underline"
                [routerLink]="base() + '/' + row.qualifiedId"
                >{{ row.qualifiedId }}</a
              >
              <span>{{ row.title }}</span>
              <app-milestone-needs [milestones]="row.milestones" />
              @for (met of row.met; track met.id) {
                <a
                  class="text-xs text-mint-leaf-800 no-underline hover:underline"
                  [routerLink]="link(met.id)"
                  >{{ met.displayName }} (met)</a
                >
              }
              @if (!row.milestones.length) {
                <span class="text-charcoal-brown-500">needs no milestone</span>
              }
              @if (editing() !== row.membershipId) {
                <ui-action-button [action]="editAction(row.membershipId, row.ids)" />
              }
            </div>
            @if (editing() === row.membershipId) {
              <fieldset
                class="m-0 flex flex-col gap-1 rounded-md border border-charcoal-brown-200 p-3"
              >
                <legend class="px-1 text-xs text-charcoal-brown-600">
                  Milestones {{ row.qualifiedId }} needs
                </legend>
                @for (milestone of projectMilestones(); track milestone.id) {
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      [checked]="picked().has(milestone.id ?? '')"
                      (change)="toggle(milestone.id ?? '')"
                    />
                    {{ milestone.displayName }}{{ milestone.met ? ' (met)' : '' }}
                  </label>
                } @empty {
                  <p class="m-0 text-charcoal-brown-500">
                    The project has no milestone.
                    <a class="text-ocean-deep-700 underline" [routerLink]="link()">Make one</a>
                  </p>
                }
                <div class="mt-1 flex gap-2">
                  <ui-action-button [action]="saveAction(row.membershipId)" />
                  <ui-action-button [action]="cancelAction()" />
                </div>
              </fieldset>
            }
          </li>
        } @empty {
          <li class="text-charcoal-brown-500">The campaign has no members.</li>
        }
      </ul>
      @if (failure(); as failure) {
        <p class="m-0 text-cinnabar-700" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class MemberMilestones {
  private readonly work = inject(SelectedWork);
  private readonly workStore = inject(WorkStore);
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(MilestonesStore);

  readonly campaign = input.required<WorkEntry>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();

  /** The membership being edited; null while none is. */
  protected readonly editing = signal<string | null>(null);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  private readonly projectId = computed(() => this.selected.project()?.id ?? '');

  /** Each membership with its member's id and title, and its milestones split met and unmet. */
  protected readonly rows = computed(() => {
    const id = this.campaign().id;
    const memberships = (id && this.work.memberships()[id]) || [];
    const entries = this.work.entries();
    return memberships.flatMap((membership) => {
      if (!membership.membershipId) return [];
      const entry = entries.find((e) => e.id === membership.entityId);
      return [
        {
          membershipId: membership.membershipId,
          qualifiedId: entry?.qualifiedId ?? membership.entityId,
          title: entry?.title ?? '',
          milestones: membership.milestones,
          met: membership.milestones.filter((m) => !!m.satisfiedAt),
          ids: membership.milestones.flatMap((m) => (m.id ? [m.id] : [])),
        },
      ];
    });
  });

  protected readonly projectMilestones = computed(
    () => this.store.listOf(this.projectId())?.milestones ?? [],
  );

  protected editAction(membershipId: string, ids: readonly string[]): Action {
    return {
      label: 'Set milestones',
      variant: 'muted',
      disabled: this.writing() || this.editing() !== null,
      callback: () => this.open(membershipId, ids),
    };
  }

  protected saveAction(membershipId: string): Action {
    return {
      label: this.writing() ? 'Saving…' : 'Save',
      variant: 'success',
      disabled: this.writing(),
      callback: () => void this.save(membershipId),
    };
  }

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.editing.set(null),
  }));

  protected link(id?: string): string {
    return milestonePath(this.selected.slug() ?? '', id);
  }

  protected toggle(id: string): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.picked.set(next);
  }

  private open(membershipId: string, ids: readonly string[]): void {
    this.failure.set(null);
    this.picked.set(new Set(ids));
    this.editing.set(membershipId);
    void this.store.loadList(this.projectId());
  }

  private async save(membershipId: string): Promise<void> {
    const campaign = workRef(this.campaign());
    if (this.writing() || !campaign) return;
    this.writing.set(true);
    this.failure.set(null);
    // In the project's order (oldest first), so the request does not depend on the ticking order.
    const order = this.projectMilestones().flatMap((m) => (m.id ? [m.id] : []));
    const ids = [...this.picked()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const outcome = await this.store.setMemberMilestones(campaign, membershipId, ids);
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    this.editing.set(null);
    const projectId = this.projectId();
    if (projectId) await this.workStore.refresh(projectId);
  }
}
