import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import type { Subscription } from 'rxjs';
import {
  approveMilestoneCriterion,
  attachWorkMilestone,
  createMilestone,
  detachWorkMilestone,
  getMilestone,
  listProjectMilestones,
  renameMilestone,
  setMilestoneGroups,
  setWorkMemberMilestones,
  type MilestoneGroupSpec,
} from '../../api/projects';
import type { DomainEvent } from '$core/events/domain-events';
import { injectRefreshOn } from '$core/events/refresh-on';
import { MILESTONE_EVENTS } from './milestone-events';
import {
  LIST_PROJECT_MILESTONES,
  MEMBER_MILESTONES,
  MILESTONE,
  MILESTONE_REFUSAL,
  WORK_MILESTONES,
  type MemberMilestones,
  type Milestone,
  type MilestoneEntry,
  type WorkMilestones,
} from './milestones.consumes';

/** A project's milestones, as `loadList` left them. */
export interface MilestoneList {
  readonly status: 'loading' | 'loaded' | 'error';
  /** Oldest first, as the service answers; empty while loading and after an error. */
  readonly milestones: readonly MilestoneEntry[];
}

/** One milestone's page data, as `load` left it. */
export interface MilestoneView {
  readonly status: 'loading' | 'loaded' | 'error';
  readonly milestone?: Milestone;
}

/** What a write answered: the value, or why not, for a person. */
export type MilestoneOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: string };

/** The service's `message` as it is, else the status, else "unreachable". */
export function milestoneRefusal(error: unknown, httpStatus: number | undefined): string {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  return httpStatus
    ? `The service refused it (HTTP ${httpStatus}).`
    : 'The service is unreachable.';
}

interface MilestonesState {
  /** Each project's milestones, by project id. */
  readonly lists: Readonly<Record<string, MilestoneList>>;
  /** Each milestone's page data, by its id. */
  readonly milestones: Readonly<Record<string, MilestoneView>>;
}

/** One write's answer, as `consume` hands it back. */
interface Answer<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly response?: { readonly status: number };
}

/**
 * A project's milestones (epic qits-615), from qits-projects' milestone doors.
 *
 * - `loadList(projectId)` reads the project's milestones once (`listProjectMilestones`, every one,
 *   met or not: the page filters), and again after an error; `refreshList` reads again and keeps
 *   the old list until the answer is in. `listOf` gives it.
 * - `load(id)` reads one milestone (`getMilestone`); `refresh`, `of` as for the list.
 * - `create(projectId, name, groups)`, `rename(id, name)`, `setGroups(id, groups)` and
 *   `approve(id, criterionId, note)` write a milestone and answer it as it stands; the store keeps
 *   that answer as the milestone's page data. `approve` is a person's (or the project's desk's):
 *   the service answers anyone else 403, whose message the page shows.
 * - `attach(qualifiedId, milestoneId)` and `detach(…)` make a work item need a milestone, or no
 *   longer (`attachWorkMilestone`, `detachWorkMilestone`), answering the item's milestones now.
 * - `setMemberMilestones(campaign, membershipId, ids)` states every milestone a campaign
 *   membership needs (`setWorkMemberMilestones`).
 * - `follow(destroy, projectId, refresh)` calls `refresh` after `MilestoneMet` or
 *   `MilestoneUnmet` about the project `projectId()` names when the event arrives.
 *
 * No write sends an event of its own unless it changes whether the milestone holds; the pages read
 * again after their own writes.
 *
 * Staleness (qits-1270): `MILESTONE_EVENTS` whose `projectId` is the open project → the
 * Milestones page's list (`refreshList`) and a milestone's page (`refresh`), each through
 * `follow`, debounced 1 s. A rename, a new milestone, an attach or a criterion edit that does not
 * change whether it holds sends no event: those show on the next read.
 */
export const MilestonesStore = signalStore(
  { providedIn: 'root' },
  withState<MilestonesState>({ lists: {}, milestones: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    function setList(projectId: string, value: MilestoneList): void {
      patchState(store, { lists: { ...store.lists(), [projectId]: value } });
    }

    function setMilestone(id: string, value: MilestoneView): void {
      patchState(store, { milestones: { ...store.milestones(), [id]: value } });
    }

    async function fetchList(projectId: string): Promise<MilestoneList> {
      const { data, error } = await consume(
        listProjectMilestones({ path: { project: projectId } }),
        LIST_PROJECT_MILESTONES,
      );
      if (error !== undefined || !data) return { status: 'error', milestones: [] };
      return { status: 'loaded', milestones: data.milestones ?? [] };
    }

    async function fetchMilestone(id: string): Promise<MilestoneView> {
      const { data, error } = await consume(getMilestone({ path: { milestoneId: id } }), MILESTONE);
      if (error !== undefined || !data?.milestone) return { status: 'error' };
      return { status: 'loaded', milestone: data.milestone };
    }

    /** A milestone write's answer: the milestone, kept as its page data, or why not. */
    function written(
      answer: Answer<{ readonly milestone?: Milestone }>,
    ): MilestoneOutcome<Milestone> {
      const { data, error, response } = answer;
      const milestone = error === undefined ? data?.milestone : undefined;
      if (!milestone?.id) {
        return { ok: false, refusal: milestoneRefusal(error, response?.status) };
      }
      setMilestone(milestone.id, { status: 'loaded', milestone });
      return { ok: true, value: milestone };
    }

    function outcome<T>(answer: Answer<T>): MilestoneOutcome<T> {
      const { data, error, response } = answer;
      if (error !== undefined || !data) {
        return { ok: false, refusal: milestoneRefusal(error, response?.status) };
      }
      return { ok: true, value: data };
    }

    return {
      async loadList(projectId: string): Promise<void> {
        const current = store.lists()[projectId];
        if (!projectId || (current && current.status !== 'error')) return;
        setList(projectId, { status: 'loading', milestones: [] });
        setList(projectId, await fetchList(projectId));
      },
      /** Reads again; the old list stays until the answer is in, and stays if it fails. */
      async refreshList(projectId: string): Promise<void> {
        const next = await fetchList(projectId);
        if (next.status === 'loaded' || !store.lists()[projectId]) setList(projectId, next);
      },
      listOf(projectId: string): MilestoneList | undefined {
        return store.lists()[projectId];
      },
      async load(id: string): Promise<void> {
        const current = store.milestones()[id];
        if (!id || (current && current.status !== 'error')) return;
        setMilestone(id, { status: 'loading' });
        setMilestone(id, await fetchMilestone(id));
      },
      /** Reads again; the old milestone stays until the answer is in, and stays if it fails. */
      async refresh(id: string): Promise<void> {
        const next = await fetchMilestone(id);
        if (next.status === 'loaded' || !store.milestones()[id]) setMilestone(id, next);
      },
      of(id: string): MilestoneView | undefined {
        return store.milestones()[id];
      },
      /** A new milestone of the project: its name, trimmed, and its whole condition. */
      async create(
        projectId: string,
        displayName: string,
        groups: readonly MilestoneGroupSpec[],
      ): Promise<MilestoneOutcome<Milestone>> {
        return written(
          await consume(
            createMilestone({
              path: { project: projectId },
              body: { displayName: displayName.trim(), groups: [...groups] },
            }),
            MILESTONE,
            MILESTONE_REFUSAL,
          ),
        );
      },
      async rename(id: string, displayName: string): Promise<MilestoneOutcome<Milestone>> {
        return written(
          await consume(
            renameMilestone({
              path: { milestoneId: id },
              body: { displayName: displayName.trim() },
            }),
            MILESTONE,
            MILESTONE_REFUSAL,
          ),
        );
      },
      /** The whole condition, PUT: a criterion left out is deleted. */
      async setGroups(
        id: string,
        groups: readonly MilestoneGroupSpec[],
      ): Promise<MilestoneOutcome<Milestone>> {
        return written(
          await consume(
            setMilestoneGroups({ path: { milestoneId: id }, body: { groups: [...groups] } }),
            MILESTONE,
            MILESTONE_REFUSAL,
          ),
        );
      },
      /** A person's yes on an APPROVAL criterion, with an optional note (blank is not sent). */
      async approve(
        id: string,
        criterionId: string,
        note?: string,
      ): Promise<MilestoneOutcome<Milestone>> {
        const text = note?.trim();
        return written(
          await consume(
            approveMilestoneCriterion({
              path: { milestoneId: id, criterionId },
              body: text ? { note: text } : {},
            }),
            MILESTONE,
            MILESTONE_REFUSAL,
          ),
        );
      },
      async attach(
        qualifiedId: string,
        milestoneId: string,
      ): Promise<MilestoneOutcome<WorkMilestones>> {
        return outcome(
          await consume(
            attachWorkMilestone({ path: { qualifiedId, milestoneId } }),
            WORK_MILESTONES,
            MILESTONE_REFUSAL,
          ),
        );
      },
      async detach(
        qualifiedId: string,
        milestoneId: string,
      ): Promise<MilestoneOutcome<WorkMilestones>> {
        return outcome(
          await consume(
            detachWorkMilestone({ path: { qualifiedId, milestoneId } }),
            WORK_MILESTONES,
            MILESTONE_REFUSAL,
          ),
        );
      },
      /** Every milestone the membership needs, whole: `[]` needs none. */
      async setMemberMilestones(
        campaign: string,
        membershipId: string,
        milestoneIds: readonly string[],
      ): Promise<MilestoneOutcome<MemberMilestones>> {
        return outcome(
          await consume(
            setWorkMemberMilestones({
              path: { qualifiedId: campaign, membershipId },
              body: { milestoneIds: [...milestoneIds] },
            }),
            MEMBER_MILESTONES,
            MILESTONE_REFUSAL,
          ),
        );
      },
      follow(
        destroy: DestroyRef,
        projectId: () => string | undefined,
        refresh: (events: readonly DomainEvent[]) => void,
      ): Subscription {
        return refreshOn(
          {
            names: MILESTONE_EVENTS,
            when: (_, ids) => {
              const id = projectId();
              return !!id && ids.projectId === id;
            },
            refresh,
          },
          destroy,
        );
      },
    };
  }),
);
