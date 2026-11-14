import type { PitchEntry } from './pitches.consumes';

/**
 * qits-projects' event for a pitch (qits-2155): `projectId`, `pitchId`, `agentName`,
 * `repositoryId`, `route`, `screenshot`, `change` (CREATED, VERSION_ADDED, ARCHIVED) and `version`.
 * The UI builder's Pitched tab reads again after it (qits-2158).
 */
export const PITCH_CHANGED = 'PitchChanged';

/** Which screenshot's pitches the Pitched tab shows (qits-2158). */
export interface PitchedScreenshot {
  /** The open repository's id; null while the project's repositories do not name it. */
  readonly repositoryId: string | null;
  /** The open repository's name, matched while its id is not known. */
  readonly repository: string;
  /** The freeze's file, as the manifest keys it (what the agent's `screenshot:` names). */
  readonly screenshot: string;
}

/**
 * The pitches of one screenshot (qits-2158), newest change (`updatedAt`) first: those of the
 * repository (by id when known, else by name) whose `screenshot` is the freeze's file and that are
 * not archived. The list is read by project only, as recorded; the narrowing is the page's.
 */
export function screenshotPitches(
  pitches: readonly PitchEntry[],
  { repositoryId, repository, screenshot }: PitchedScreenshot,
): readonly PitchEntry[] {
  return pitches
    .filter(
      (pitch) =>
        (repositoryId === null
          ? pitch.repositoryName === repository
          : pitch.repositoryId === repositoryId) &&
        pitch.screenshot === screenshot &&
        !pitch.archivedAt,
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
