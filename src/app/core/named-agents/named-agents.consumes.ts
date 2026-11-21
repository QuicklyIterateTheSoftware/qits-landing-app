import type {
  ListAgentsResponses,
  StartAgentErrors,
  StartAgentResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What the agent dialog reads from qits-projects' named agents (qits-2157, qits-2499, the doors of
 * qits-2154). Each operation passes its list to `consume(...)`, so it cannot read any other field,
 * and its pact spec passes the same list as `consumes`. To read another field, add it here.
 */

/** `NAMED_AGENTS`: each named agent's name, its state, and the command running it now. */
export const LIST_AGENTS = ['agents[].name', 'agents[].state', 'agents[].commandId'] as const;

/** One named agent, cut to what the dialog reads. */
export type NamedAgentEntry = Consumed<
  ListAgentsResponses[200],
  typeof LIST_AGENTS
>['agents'][number];

/** `START_NAMED_AGENT`: the started agent as the listing answers it, cut the same way. */
export const START_AGENT = ['name', 'state', 'commandId'] as const;

/** A start's answer: the agent's name, state and command. */
export type NamedAgentStarted = Consumed<StartAgentResponses[200], typeof START_AGENT>;

/** A refused start (404): the service's `reason`. */
export const AGENT_REFUSAL = ['reason'] as const;

/** A refusal's body, cut to what the dialog reads. */
export type NamedAgentRefusal = Consumed<StartAgentErrors[404], typeof AGENT_REFUSAL>;
