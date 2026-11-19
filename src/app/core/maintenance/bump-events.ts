/**
 * The domain events after which bumps may have moved: a release or an artifact that makes a bump
 * owed, a build that ends a bump's run, and a release request that changes or moves a bump's
 * release (`ReleaseRequestStateChanged` is the only event a release's READY → RELEASED →
 * FINALIZED sends for a repository with no deployment). The bumps menu reads its pending bumps
 * again after any of them; the bump page (qits-2332) its bump, while that bump is under way.
 */
export const BUMP_EVENTS = [
  'SoftwareRelease',
  'SCMRelease',
  'BuildSuccessful',
  'BuildFailed',
  'ReleaseRequestChanged',
  'ReleaseRequestStateChanged',
] as const;
