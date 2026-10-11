import type { WorkStatusMove } from '../../api/projects';

/**
 * Why a DROP move closed the item (qits-248), binding for every repository on the wire:
 *
 * - `DUPLICATE`: another item asks for the same thing.
 * - `RESOLVED_ELSEWHERE`: another item's change resolved it.
 * - `SUPERSEDED`: replaced by a successor.
 * - `OBSOLETE`: the subject went away by itself.
 * - `INVALID`: it never was a problem.
 * - `WONT_DO`: decided not to do it (also scratch/probe items).
 *
 * Not in the generated client yet: qits-projects-service has not released the field, so
 * `openapi-ts` has nothing to generate it from (`npm run generate:api` reads the sibling's
 * `docs/openapi.yml`, and that document does not carry it). Extended here by hand, as a plain
 * string union rather than edited into `types.gen.ts`: that file is regenerated wholesale and a
 * hand edit would be silently lost on the next `generate:api`. Drop this file's definitions once
 * the client is regenerated against a service that serves them, and import `Outcome` (already
 * generated, used elsewhere in the document) in their place.
 */
export type WorkOutcome =
  'DUPLICATE' | 'RESOLVED_ELSEWHERE' | 'SUPERSEDED' | 'OBSOLETE' | 'INVALID' | 'WONT_DO';

/**
 * `WorkStatusMove`, plus the fields a DROP move carries (qits-248): `outcome`, required on every
 * move into DROPPED, and `supersededBy` (a UUID or a qualified id, e.g. `qits-378`), required
 * exactly for the three outcomes whose {@link OutcomeOption.referenceRequired} is true. An
 * intersection, not an edit of the generated type (see this file's header) — structurally a
 * `WorkStatusMove` with extra optional properties, so it is accepted wherever one is.
 *
 * The deployed service ignores unknown JSON properties, so sending these ahead of its release is
 * safe; the next one will require them on a DROP move and refuse a mismatch with 400.
 */
export type DropMove = WorkStatusMove & {
  readonly outcome?: WorkOutcome;
  readonly supersededBy?: string;
};

/** One outcome the Drop form offers: its wire value, its label, and whether it needs a reference. */
export interface OutcomeOption {
  readonly value: WorkOutcome;
  readonly label: string;
  readonly referenceRequired: boolean;
}

/** The six outcomes, in the order the form lists them, with a short human label for each. */
export const OUTCOME_OPTIONS: readonly OutcomeOption[] = [
  { value: 'DUPLICATE', label: 'Duplicate', referenceRequired: true },
  { value: 'RESOLVED_ELSEWHERE', label: 'Resolved elsewhere', referenceRequired: true },
  { value: 'SUPERSEDED', label: 'Superseded', referenceRequired: true },
  { value: 'OBSOLETE', label: 'Obsolete', referenceRequired: false },
  { value: 'INVALID', label: 'Invalid', referenceRequired: false },
  { value: 'WONT_DO', label: "Won't do", referenceRequired: false },
];

/** Whether `outcome` needs a reference (`supersededBy`) alongside it. */
export function referenceRequired(outcome: WorkOutcome | null): boolean {
  return OUTCOME_OPTIONS.find((o) => o.value === outcome)?.referenceRequired ?? false;
}
