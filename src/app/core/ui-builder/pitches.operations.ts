import { qitsOperation } from '@qits/angular';
import { getPitch, getPitchVersion, listPitches } from '../../api/projects';
import { GET_PITCH, GET_PITCH_VERSION, LIST_PITCHES } from './pitches.consumes';

/**
 * qits-projects' pitches (qits-2155: a named agent's mock of one screenshot, kept per agent with
 * numbered versions) declared as operations, for the UI builder's Pitched tab (qits-2158), which
 * reads them through `qitsResource`; `pitches.operations.pact.spec.ts` binds each with the same
 * provider, operationId and `consumes`. The CLI's twins are `qits pitches list` and
 * `qits pitches show`. The page only reads: the agent creates, versions and archives.
 */

/**
 * A project's pitches (`?project=<id>`, as recorded), newest change first, archived ones left out.
 * The tab narrows them to the open repository and screenshot itself: a project has few pitches, and
 * a narrower query would be a request shape no recording holds.
 */
export const PITCHES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listPitches',
  method: 'GET',
  call: listPitches,
  consumes: LIST_PITCHES,
});

/** One pitch (`…/pitches/{id}`) with every version, oldest first, without their HTML. */
export const PITCH = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getPitch',
  method: 'GET',
  call: getPitch,
  consumes: GET_PITCH,
});

/**
 * One version of a pitch with its HTML (`…/versions/{number}`): `latest` for the newest, else the
 * version's number. The HTML is agent-authored and unsanitised: it is only ever drawn in a
 * `sandbox="allow-same-origin"` frame, never with `allow-scripts`, never as `innerHTML`.
 */
export const PITCH_VERSION = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getPitchVersion',
  method: 'GET',
  call: getPitchVersion,
  consumes: GET_PITCH_VERSION,
});
