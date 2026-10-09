/** A release request page's tabs, in `?tab=`, in order. */
export const RELEASE_TABS = ['overview', 'commits', 'runs', 'changes'] as const;

/** One of the page's tabs. */
export type ReleaseTab = (typeof RELEASE_TABS)[number];

/** A tab as the strip shows it: its key, its label and, where it is known, a count. */
export interface ReleaseTabEntry {
  readonly key: ReleaseTab;
  readonly label: string;
  readonly count?: number;
}

/** The tab a `?tab=` value names; anything else (or nothing) is the overview. */
export function releaseTabOf(value: string | null | undefined): ReleaseTab {
  return RELEASE_TABS.includes(value as ReleaseTab) ? (value as ReleaseTab) : 'overview';
}

/** The tab strip: commits and runs counted when they are known (the runs once read). */
export function releaseTabs(counts: {
  readonly commits?: number;
  readonly runs?: number;
}): readonly ReleaseTabEntry[] {
  return [
    { key: 'overview', label: 'Overview' },
    { key: 'commits', label: 'Commits', count: counts.commits },
    { key: 'runs', label: 'CI runs', count: counts.runs },
    { key: 'changes', label: 'Changes' },
  ];
}
