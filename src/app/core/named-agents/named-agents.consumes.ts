import type {
  ListAgentsResponses,
  PromptAgentErrors,
  PromptAgentResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What the UI builder's agent dialog reads from qits-projects' named agents (qits-2157, the doors of
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

/** `PROMPT_NAMED_AGENT`: whether the prompt was delivered, queued (where), or held while it starts. */
export const PROMPT_AGENT = ['state', 'delivered', 'queued', 'position'] as const;

/** A prompt's answer (200, or 202 while the agent starts), cut to what the dialog reads. */
export type NamedAgentPromptAnswer = Consumed<PromptAgentResponses[200], typeof PROMPT_AGENT>;

/** A refused prompt (400, 404, 409, 429, 503): the service's `reason`. */
export const AGENT_REFUSAL = ['reason'] as const;

/** A refusal's body, cut to what the dialog reads. */
export type NamedAgentRefusal = Consumed<PromptAgentErrors[409], typeof AGENT_REFUSAL>;
