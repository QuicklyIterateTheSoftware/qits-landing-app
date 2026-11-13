import { isPlatformBrowser } from '@angular/common';
import { computed, type DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { qitsResource } from '@qits/angular';
import { injectRefreshOn } from '$core/events/refresh-on';
import { owedReload } from '$core/resources/owed-reload';
import { ACTIVE_AGENT_EVENTS } from './workspace-events';
import { ACTIVE_AGENT_WORK, OPEN_WORKSPACES } from './workspaces.operations';

/**
 * The workspaces and agents qits-workspaces holds for work items, as the work pages read them
 * (epic qits-112; qits-2146, in place of `WorkspacesStore`): two root `qitsResource`s, each read in
 * the browser once something wants it, then shared.
 *
 * - `open`, over `OPEN_WORKSPACES` (`listOpenWorkspaces`): the platform's ACTIVE workspaces bound to
 *   a work item. The work layout and the work item page want it (`wantOpen()`); the cards' Workspace
 *   links then ask `hasOpen(workId)` and cost nothing.
 * - `agents`, over `ACTIVE_AGENT_WORK` (`listAgents?state=ACTIVE`): the In Progress tab shows every
 *   item an agent works on, whatever its status (`wantAgents()`); `agentSet` holds their items' ids.
 *   A failed read (a visitor whose roles do not reach the door) leaves it empty.
 *
 * A failed read again keeps the last good answer. An item's own workspaces in every state are the
 * work item page's own read (`WORK_ITEM_WORKSPACES`).
 *
 * Staleness (qits-1270): `follow(destroy)`, while a work page lives: `AgentPlaced`, `AgentRequeued`,
 * `AgentObsolete`, `AgentRemoved` (any: the events name no project, and an item that just got an
 * agent is not one the list knows yet) → each of the two reads already made (`reload()`), at most
 * once a second. Not the resources' own `refreshOn`: they are the app's, and the events are wanted
 * only while a work page shows. No longer `EntityTransitioned`: a work item's move changes nothing
 * qits-workspaces holds; the agent events that follow it do. Not announced: an agent's creation (no
 * `AgentCreated`), so a queued agent's item reaches the In Progress tab only once it is placed.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceActivity {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly refreshOn = injectRefreshOn();
  private readonly openWanted = signal(false);
  private readonly agentsWanted = signal(false);

  /** The platform's ACTIVE workspaces bound to a work item. */
  readonly open = qitsResource(OPEN_WORKSPACES, () =>
    this.browser && this.openWanted() ? {} : undefined,
  );

  /** The platform's ACTIVE agents. */
  readonly agents = qitsResource(ACTIVE_AGENT_WORK, () =>
    this.browser && this.agentsWanted() ? { query: { state: 'ACTIVE' as const } } : undefined,
  );

  private readonly reloadOpen = owedReload(this.open);
  private readonly reloadAgents = owedReload(this.agents);

  /** The ids of the work items (qits-projects' entity ids) that have an ACTIVE workspace. */
  readonly openSet = computed(
    (): ReadonlySet<string> =>
      new Set(
        (this.open.hasValue() ? (this.open.value()?.entries ?? []) : []).flatMap((e) =>
          e.workspace?.workId ? [e.workspace.workId] : [],
        ),
      ),
  );

  /** The ids of the work items (qits-projects' entity ids) an ACTIVE agent works on. */
  readonly agentSet = computed(
    (): ReadonlySet<string> =>
      new Set(
        (this.agents.hasValue() ? (this.agents.value()?.agents ?? []) : []).flatMap((a) =>
          a.workId ? [a.workId] : [],
        ),
      ),
  );

  /** Reads the open workspaces from now on; a failed read again. */
  wantOpen(): void {
    if (this.openWanted() && this.open.status() === 'error') this.open.reload();
    this.openWanted.set(true);
  }

  /** Reads the ACTIVE agents from now on; a failed read again. */
  wantAgents(): void {
    if (this.agentsWanted() && this.agents.status() === 'error') this.agents.reload();
    this.agentsWanted.set(true);
  }

  /** Whether the item with this id has an ACTIVE workspace. */
  hasOpen(workId: string | undefined): boolean {
    return !!workId && this.openSet().has(workId);
  }

  /** Keeps the reads made current while `destroy` lives. */
  follow(destroy: DestroyRef): void {
    this.refreshOn(
      {
        names: ACTIVE_AGENT_EVENTS,
        refresh: () => {
          if (this.open.hasValue()) this.reloadOpen();
          if (this.agents.hasValue()) this.reloadAgents();
        },
      },
      destroy,
    );
  }
}
