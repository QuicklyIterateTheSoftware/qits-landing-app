import type { GetTerminalResponses, OpenTerminalResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the System section reads of qits-system's terminal doors (qits-2356): `SYSTEM_TERMINAL`,
 * `OPEN_SYSTEM_TERMINAL` and `CLOSE_SYSTEM_TERMINAL` (`terminals.operations.ts`) declare it as
 * `consumes`, so nothing else can be read, and their pact spec binds the same lists. To read
 * another field, add it here.
 */

/**
 * `SYSTEM_TERMINAL`: one terminal, as its page shows it. Not `attachedClients` (stale the moment it
 * is read: the page's own socket is one of them) nor `socketPath` (the page builds the socket's
 * address itself, `systemTerminalSocketUrl`).
 */
export const SYSTEM_TERMINAL_FIELDS = [
  'id',
  'kind',
  'container.id',
  'container.name',
  'shell',
  'createdAt',
  'createdBy',
] as const;

/** One terminal, cut to what its page reads. */
export type SystemTerminal = Consumed<GetTerminalResponses[200], typeof SYSTEM_TERMINAL_FIELDS>;

/** `OPEN_SYSTEM_TERMINAL`: the new terminal's id, the address of its page. */
export const OPENED_TERMINAL = ['id'] as const;

/** The opened terminal, cut to its id. */
export type OpenedTerminal = Consumed<OpenTerminalResponses[201], typeof OPENED_TERMINAL>;

/**
 * What a refusal of a terminal door says: qits-system's `message` (`no such terminal: <id>`, a
 * container that is not running, the terminal limit reached), shown as it is.
 */
export const TERMINAL_REFUSAL = ['message'] as const;

/** `CLOSE_SYSTEM_TERMINAL`: a 204, whose answer the page does not read. */
export const TERMINAL_CLOSED = [] as const;
