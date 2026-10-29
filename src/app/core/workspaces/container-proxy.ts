/**
 * qits-workspaces' container proxy (epic qits-1230): `/workspaces/container/<slot row id>/…` reaches
 * one slot's daemon, whose own paths go below it verbatim. It addresses the slot, not an agent, so
 * only what belongs to the slot's container uses it — the harness install (sign-in, plugins) on the
 * workspace page. The agent page reaches its agent through the agent proxy (`agent-proxy.ts`) and
 * never imports this module (`agent-doors.spec.ts`).
 */
export const CONTAINER_PREFIX = '/workspaces/container';

/** The daemon's own base, `<qits-workspaces' origin>/workspaces/container/<slot row id>`. */
export function containerBase(origin: string, workspaceRowId: number): string {
  return `${origin}${CONTAINER_PREFIX}/${encodeURIComponent(workspaceRowId)}`;
}

/**
 * The daemon's terminal socket for one of the slot's own commands (the sign-in terminal), `WS
 * /terminal/commands/{id}`: `wss://workspaces.<domain>/workspaces/container/<slot row
 * id>/terminal/commands/<command id>` (`ws:` when qits-workspaces' origin is `http:`).
 */
export function containerTerminalSocketUrl(
  origin: string,
  workspaceRowId: number,
  commandId: string,
): string {
  const base = containerBase(origin, workspaceRowId).replace(/^http(s?):/, 'ws$1:');
  return `${base}/terminal/commands/${encodeURIComponent(commandId)}`;
}
