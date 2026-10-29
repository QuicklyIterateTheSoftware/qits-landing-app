/**
 * qits-workspaces' agent proxy (epic qits-1667): `/workspaces/agent/<agent id>/…` reaches the
 * daemon of the workspace the agent is placed in now, so a caller names the agent and never its
 * slot. Its routes are its own, and the service maps each onto the daemon's path:
 *
 * - `WS terminal`, `WS chat`: the agent's running harness command's terminal or chat socket;
 * - `GET log`: its harness command's log (the last one of a yielded or stopped agent too);
 * - `POST prompt-refinements`: the daemon's prompt rewrite, over the harness installed in the
 *   agent's container;
 * - `GET files[/…]`, `GET detection`, `GET component-map`: its worktree
 *   (`agent-worktrees/<agent id>/…` on the daemon).
 *
 * The daemon's answers come back verbatim, so a read keeps the daemon's generated client and its
 * types, and only its address changes (`agentRoute`).
 */
export const AGENT_PREFIX = '/workspaces/agent';

/** The agent's base on the proxy, `<qits-workspaces' origin>/workspaces/agent/<agent id>`. */
export function agentBase(origin: string, agentId: string): string {
  return `${origin}${AGENT_PREFIX}/${encodeURIComponent(agentId)}`;
}

/**
 * The agent's terminal or chat socket: `wss://workspaces.<domain>/workspaces/agent/<agent
 * id>/<channel>` (`ws:` when qits-workspaces' origin is `http:`). The service attaches it to the
 * agent's running harness command; a caller never names the command.
 */
export function agentSocketUrl(origin: string, agentId: string, channel: 'terminal' | 'chat') {
  return `${agentBase(origin, agentId).replace(/^http(s?):/, 'ws$1:')}/${channel}`;
}

/** A route of the agent proxy that a daemon operation is reached at. */
export type AgentRoute =
  'files' | 'files/content' | 'detection' | 'component-map' | 'log' | 'prompt-refinements';

/**
 * Where a daemon operation is reached through the agent proxy, as the generated call's `baseUrl`
 * and `url`: `listFiles({ ...agentRoute(origin, agentId, 'files'), path: { agentId } })` goes to
 * `<origin>/workspaces/agent/<agent id>/files`, which the service forwards to the daemon's
 * `/agent-worktrees/<agent id>/files`. The generated function spreads its options after its own
 * `url`, so this `url` is the one sent; the answer is the daemon's, typed by its client.
 */
export function agentRoute(
  origin: string,
  agentId: string,
  route: AgentRoute,
): { readonly baseUrl: string; readonly url: string } {
  return { baseUrl: agentBase(origin, agentId), url: `/${route}` };
}
