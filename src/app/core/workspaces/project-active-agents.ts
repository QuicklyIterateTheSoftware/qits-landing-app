import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { qitsResource } from '@qits/angular';
import { payloadIds } from '$core/events/refresh-on';
import { SelectedProject } from '$core/projects/selected-project';
import type { ProjectStatusAgent } from './agents.consumes';
import { LIST_PROJECT_ACTIVE_AGENTS } from './agents.operations';
import {
  aboutProjectAgents,
  AGENT_STATUS_EVENTS,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
} from './workspace-events';

/**
 * The open project's ACTIVE agents with their waits and attention (epic qits-1681), as the shell
 * reads them (qits-2146): the top bar's agents menu, which the shell hands this service's
 * `resource`, and the trail's agent crumb (an agent named by its item). One root service holding
 * one `qitsResource` over `LIST_PROJECT_ACTIVE_AGENTS`, read once the open project is known, in the
 * browser only (the server render has no session to send), and again on each opening of the menu
 * (`resource.reload()`). A failed read again keeps the agents shown.
 *
 * The Agents page reads the same request on its own (qits-2143); the agent page reads this
 * service's (qits-2146).
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `AGENT_STATUS_EVENTS` about the open project
 * (`aboutProjectAgents`: the five status events by their `projectId`; `AgentNudged` and
 * `ACTIVE_AGENT_EVENTS`, which name no project, by an agent or a repository of the agents already
 * listed) → the agents, debounced 1 s. A wait's request
 * gates follow `RELEASE_REQUEST_EVENTS` through `ProjectReleaseRequests`, an item's status and
 * block `WORK_EVENTS` wherever the work is followed, not this. No timer and no second stream.
 */
@Injectable({ providedIn: 'root' })
export class ProjectActiveAgents {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The open project's id, in the browser only: the read waits for it. */
  readonly projectId = computed(() => (this.browser ? this.selected.project()?.id : undefined));

  /** The open project's ACTIVE agents. */
  readonly resource = qitsResource(
    LIST_PROJECT_ACTIVE_AGENTS,
    () => {
      const projectId = this.projectId();
      return projectId ? { query: { projectId, state: 'ACTIVE' as const } } : undefined;
    },
    {
      refreshOn: {
        names: AGENT_STATUS_EVENTS,
        when: (event) => aboutProjectAgents(payloadIds(event), this.projectId(), this.agents()),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  /** The agents, as the service orders them; none until it answered. */
  readonly agents = computed((): readonly ProjectStatusAgent[] =>
    this.resource.hasValue() ? (this.resource.value()?.agents ?? []) : [],
  );
}
