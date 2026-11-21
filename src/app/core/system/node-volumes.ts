/**
 * Pure helpers of the swarm node page's Volumes tab (qits-2355): which volumes are anonymous, how
 * a volume's labels and an anonymous volume's name are drawn.
 */

/** The label docker puts on a volume it created for a container's unnamed mount. */
export const ANONYMOUS_VOLUME_LABEL = 'com.docker.volume.anonymous';

/** How many characters of an anonymous volume's 64-hex name the table shows (docker's short id). */
const SHORT_NAME = 12;

type Labels = Readonly<Record<string, string>> | undefined;

/** Whether a volume is anonymous: its labels carry docker's `com.docker.volume.anonymous` key. */
export function isAnonymousVolume(volume: { readonly labels?: Labels }): boolean {
  return Object.prototype.hasOwnProperty.call(volume.labels ?? {}, ANONYMOUS_VOLUME_LABEL);
}

/**
 * A volume's labels as `key=value`, sorted by key, without the anonymous marker (the row's
 * "anonymous" chip says it instead).
 */
export function volumeLabelPairs(labels: Labels): string[] {
  return Object.entries(labels ?? {})
    .filter(([key]) => key !== ANONYMOUS_VOLUME_LABEL)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
}

/** An anonymous volume's name as the table shows it: its first 12 characters. */
export function shortVolumeName(name: string | undefined): string {
  return (name ?? '').slice(0, SHORT_NAME);
}
