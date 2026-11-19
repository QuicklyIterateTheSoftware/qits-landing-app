/**
 * The domain events after which a release's adoption may have moved (qits-2333): a downstream
 * repository releasing (`SCMRelease`, its tag) or publishing (`SoftwareRelease`, its artifacts,
 * whose SBOMs the service reads) is what turns a PENDING card ADOPTED. The adoption page reads its
 * journey again after either.
 */
export const ADOPTION_EVENTS = ['SCMRelease', 'SoftwareRelease'] as const;
