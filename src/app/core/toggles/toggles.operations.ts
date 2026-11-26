import { qitsOperation } from '@qits/angular';
import { getToggle, getToggles, putToggleRules } from '../../api/toggles';
import { GET_TOGGLE, LIST_TOGGLES, SAVED_TOGGLE, TOGGLE_REFUSAL } from './toggles.consumes';

/**
 * qits-toggles' configuration doors (qits-2704), read and written by the Toggles section;
 * `toggles.operations.pact.spec.ts` binds them. There is no create and no delete door: a toggle
 * exists by its declaration in qits-toggles-service's code.
 *
 * `TOGGLE_LIST`: every declared toggle, by slug.
 */
export const TOGGLE_LIST = qitsOperation({
  provider: 'qits-toggles-service',
  operationId: 'getToggles',
  method: 'GET',
  call: getToggles,
  consumes: LIST_TOGGLES,
});

/** `TOGGLE_DETAIL`: one toggle and its ordered rules; 404 when no toggle has that slug. */
export const TOGGLE_DETAIL = qitsOperation({
  provider: 'qits-toggles-service',
  operationId: 'getToggle',
  method: 'GET',
  call: getToggle,
  consumes: GET_TOGGLE,
  errorConsumes: TOGGLE_REFUSAL,
});

/**
 * `TOGGLE_RULES_SAVE`: the whole ordered list and the version it was read at (`qits:admin` or the
 * delivery desk). 400 names the rule at fault (`position`), 403 is a caller without the role, 409
 * a version someone else moved first.
 */
export const TOGGLE_RULES_SAVE = qitsOperation({
  provider: 'qits-toggles-service',
  operationId: 'putToggleRules',
  method: 'PUT',
  call: putToggleRules,
  consumes: SAVED_TOGGLE,
  errorConsumes: TOGGLE_REFUSAL,
});
