import type {
  GetPitchResponses,
  GetPitchVersionResponses,
  ListPitchesResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What the UI builder's Pitched tab reads from qits-projects' pitches (qits-2158, the doors of
 * qits-2155). Each operation passes its list to `consume(...)`, so it cannot read any other field,
 * and its pact spec passes the same list as `consumes`. To read another field, add it here.
 */

/**
 * `PITCHES`: each pitch's id, who pitched it, the screenshot it mocks (repository, file), the bundle
 * version it was pitched against, its title and note, whether it is archived and when it changed.
 */
export const LIST_PITCHES = [
  'pitches[].id',
  'pitches[].agent',
  'pitches[].repositoryId',
  'pitches[].repositoryName',
  'pitches[].screenshot',
  'pitches[].manifestVersion',
  'pitches[].title',
  'pitches[].note',
  'pitches[].archivedAt',
  'pitches[].updatedAt',
] as const;

/** One pitch of the list, cut to what the tab reads. */
export type PitchEntry = Consumed<
  ListPitchesResponses[200],
  typeof LIST_PITCHES
>['pitches'][number];

/** `PITCH`: the pitch's id, its newest version's number and each version's number, note and time. */
export const GET_PITCH = [
  'id',
  'latestVersion',
  'versions[].number',
  'versions[].note',
  'versions[].createdAt',
] as const;

/** One pitch with its versions, cut to what the version picker reads. */
export type PitchVersions = Consumed<GetPitchResponses[200], typeof GET_PITCH>;

/** `PITCH_VERSION`: the version's number and its HTML, drawn in the sandboxed frame. */
export const GET_PITCH_VERSION = ['number', 'html'] as const;

/** One version's HTML, cut to what the frame reads. */
export type PitchHtml = Consumed<GetPitchVersionResponses[200], typeof GET_PITCH_VERSION>;
