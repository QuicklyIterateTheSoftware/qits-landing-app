import { formatInstant } from '$core/release-requests/release-request-model';

/**
 * A toggle's use and retirement as the Toggles section shows them (qits-2726), from qits-toggles'
 * `lastUsedAt` and `removalTicket`.
 */

/** The project qits-toggles files its removal tickets in. */
export const REMOVAL_TICKET_PROJECT = 'qits';

/** A qualified work id of that project: `qits-1`. */
const QUALIFIED = /^qits-\d+$/;

/**
 * When a retirement run last saw a deployed pact evaluate the toggle, `1 Jan 2026 00:00:00Z`
 * (`formatInstant`); none yet reads "never by a deployed pact".
 */
export function lastUsedText(lastUsedAt: string | null | undefined): string {
  return lastUsedAt ? formatInstant(lastUsedAt) : 'never by a deployed pact';
}

/**
 * The open removal ticket's qualified id in {@link REMOVAL_TICKET_PROJECT}, which links to the
 * item's page; undefined for none, and for the entity uuid qits-toggles falls back to when it has
 * no qualified id (shown as text).
 */
export function removalTicketId(removalTicket: string | null | undefined): string | undefined {
  return removalTicket && QUALIFIED.test(removalTicket) ? removalTicket : undefined;
}
