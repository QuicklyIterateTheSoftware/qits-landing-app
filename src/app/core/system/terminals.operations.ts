import { qitsOperation } from '@qits/angular';
import { closeTerminal, getTerminal, openTerminal } from '../../api/system';
import {
  OPENED_TERMINAL,
  SYSTEM_TERMINAL_FIELDS,
  TERMINAL_CLOSED,
  TERMINAL_REFUSAL,
} from './terminals.consumes';

/**
 * qits-system's terminals (qits-2356): an interactive shell in a container of the node qits-system
 * runs on, declared as operations; `terminals.operations.pact.spec.ts` binds them. The terminal's
 * screen is its socket (`systemTerminalSocketUrl`), not a door.
 *
 * A terminal lives in qits-system's memory only: it ends a minute after its last viewer detaches
 * (`qits.system.terminals.linger`) and on every restart, so a read of an old address is a 404.
 */

/** `SYSTEM_TERMINAL`: one terminal by its id; a 404 (`message`) once it has ended. */
export const SYSTEM_TERMINAL = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'getTerminal',
  method: 'GET',
  call: getTerminal,
  consumes: SYSTEM_TERMINAL_FIELDS,
  errorConsumes: TERMINAL_REFUSAL,
});

/**
 * `OPEN_SYSTEM_TERMINAL`: a new exec terminal ({@link execTerminalBody}), 201 with its id. A 404
 * when the container is gone, a 409 when it is not running or the terminal limit is reached, each
 * with a `message` the Containers tab shows.
 */
export const OPEN_SYSTEM_TERMINAL = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'openTerminal',
  method: 'POST',
  call: openTerminal,
  consumes: OPENED_TERMINAL,
  errorConsumes: TERMINAL_REFUSAL,
});

/** `CLOSE_SYSTEM_TERMINAL`: ends a terminal, 204; a 404 when it had ended already. */
export const CLOSE_SYSTEM_TERMINAL = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'closeTerminal',
  method: 'DELETE',
  call: closeTerminal,
  consumes: TERMINAL_CLOSED,
});

/** The shells a container row offers. */
export const TERMINAL_SHELLS = ['bash', 'sh'] as const;

export type TerminalShell = (typeof TERMINAL_SHELLS)[number];

/** `OPEN_SYSTEM_TERMINAL`'s params: `shell` in `container` (its name or id; docker takes either). */
export function execTerminalBody(container: string, shell: TerminalShell) {
  return { body: { kind: 'EXEC', container, shell } };
}
