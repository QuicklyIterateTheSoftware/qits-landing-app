/**
 * A qits-system terminal's socket (qits-2356): `wss://system.<domain>/system/api/terminals/<id>`
 * (`ws:` when qits-system's origin is `http:`), the same scheme swap as `agentSocketUrl`. The wire
 * is `TerminalSocket`'s: `{"type":"data"}` and `{"type":"resize"}` frames in, raw text out, the
 * scrollback replayed on every attach, a close with 1000 final.
 *
 * The page is served at `qits.<domain>` and the socket is qits-system's own name, so the service's
 * origin check admits every `https` name under `qits.<domain>` (qits-2356) and refuses a foreign
 * site (the CSWSH guard of a root shell).
 */
export function systemTerminalSocketUrl(origin: string, id: string): string {
  const base = origin.replace(/\/+$/, '').replace(/^http(s?):/, 'ws$1:');
  return `${base}/system/api/terminals/${encodeURIComponent(id)}`;
}
