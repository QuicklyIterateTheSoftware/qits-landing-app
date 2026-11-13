import { InjectionToken, type Signal } from '@angular/core';
import type { AgentDetail } from './agents.consumes';

/**
 * The agent an agent's page shows (qits-2146), as its tabs read it: the agent layout
 * (`agent.layout.ts`) reads the agent through its own `qitsResource` over `AGENT_DETAIL` and
 * provides itself under this token, so the Chat, Files and Terminal tabs (its child routes) follow
 * the same read, one request, instead of a store keyed by the agent's id. Not a root service: it
 * lives as long as the agent's page.
 */
export interface OpenAgentRead {
  /** The agent's id in the URL (the layout's `:agentId`). */
  readonly agentId: Signal<string>;
  /** The agent, once read; undefined before, and for an agent the service does not know. */
  readonly agent: Signal<AgentDetail | undefined>;
  /** Reads the agent again (its run state, its slot), as a tab's own event or write asks. */
  reload(): void;
}

/** Where an agent page's tabs find the agent the layout read. */
export const OPEN_AGENT = new InjectionToken<OpenAgentRead>('OPEN_AGENT');
