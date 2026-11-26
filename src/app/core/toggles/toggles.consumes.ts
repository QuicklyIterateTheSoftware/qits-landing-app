import type {
  GetToggleResponses,
  GetTogglesResponses,
  PutToggleRulesResponses,
} from '../../api/toggles';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-toggles (qits-2704): each operation of `toggles.operations.ts`
 * declares its list as `consumes`, so nothing else can be read, and `toggles.operations.pact.spec.ts`
 * binds the same lists. To read another field, add it here.
 */

/** `TOGGLE_LIST`: each declared toggle's slug, description and its rules in brief. */
export const LIST_TOGGLES = [
  '[].slug',
  '[].description',
  '[].declaredDefault',
  '[].rules[].kind',
  '[].rules[].value',
] as const;

/** `TOGGLE_DETAIL`: one toggle, its ordered rules whole, and the version a save names. */
export const GET_TOGGLE = [
  'slug',
  'description',
  'declaredDefault',
  'version',
  'rules[].kind',
  'rules[].value',
  'rules[].userSubjects',
  'rules[].afterInstant',
] as const;

/** `TOGGLE_RULES_SAVE`: the toggle as it is now, its version moved by one. */
export const SAVED_TOGGLE = [
  'version',
  'rules[].kind',
  'rules[].value',
  'rules[].userSubjects',
  'rules[].afterInstant',
] as const;

/** A refusal's body (400, 404, 409): what went wrong and, for a 400, the rule at fault. */
export const TOGGLE_REFUSAL = ['error', 'position'] as const;

/** A status alone: the 403 carries no body. */
export const STATUS_ONLY = [] as const;

/** The toggles list, cut to what the page reads. */
export type ToggleRows = Consumed<GetTogglesResponses[200], typeof LIST_TOGGLES>;

/** One toggle row, cut to what the list reads. */
export type ToggleRow = ToggleRows[number];

/** One toggle, cut to what the editor reads. */
export type ToggleDetail = Consumed<GetToggleResponses[200], typeof GET_TOGGLE>;

/** A saved toggle, cut to what the editor reads of it. */
export type SavedToggle = Consumed<PutToggleRulesResponses[200], typeof SAVED_TOGGLE>;
