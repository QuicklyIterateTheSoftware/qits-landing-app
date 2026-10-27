/** The branch prefix of a release request's automation runs: `maintenance/automations/<kind>/<request id>`. */
export const AUTOMATION_BRANCHES = 'maintenance/automations/';

/** The fields of a CI run this reads; both qits-ci lists give them. */
export interface RunLike {
  readonly id?: string;
  readonly status?: string;
  readonly branch?: string;
  readonly releaseRequestId?: string | null;
}

/** A run of a release request that holds a CI slot (`RUNNING`) or waits for one (`QUEUED`). */
export interface ActiveRun {
  readonly runId: string;
  /** `ci`: the request's own builds (QA, release, gates); `automation`: its automations. */
  readonly kind: 'ci' | 'automation';
  readonly status: 'RUNNING' | 'QUEUED';
  /** "CI running", "Automation queued"… */
  readonly label: string;
}

const KIND_NAMES = { ci: 'CI', automation: 'Automation' } as const;

/**
 * The active runs of a release request: at most one per kind, a running one before a queued one,
 * else the first in `runs` (qits-ci lists newest first); CI before automation. A run is the request's when it names the
 * request (`releaseRequestId`), runs on one of the request's automation branches, or is one of
 * `namedRunIds` (the runs the request itself names: phases, gates, automations).
 */
export function activeRunsOf(
  requestId: string | undefined,
  runs: readonly RunLike[] | undefined,
  namedRunIds: readonly (string | null | undefined)[] = [],
): readonly ActiveRun[] {
  if (!requestId || !runs?.length) return [];
  const named = new Set(namedRunIds.filter((id): id is string => !!id));
  const found = new Map<ActiveRun['kind'], ActiveRun>();
  for (const run of runs) {
    const status = run.status;
    if (!run.id || (status !== 'RUNNING' && status !== 'QUEUED')) continue;
    const automation = !!run.branch?.startsWith(AUTOMATION_BRANCHES);
    const ours =
      run.releaseRequestId === requestId ||
      named.has(run.id) ||
      (automation && run.branch!.endsWith(`/${requestId}`));
    if (!ours) continue;
    const kind = automation ? 'automation' : 'ci';
    const held = found.get(kind);
    if (held && (held.status === 'RUNNING' || status === 'QUEUED')) continue;
    found.set(kind, {
      runId: run.id,
      kind,
      status,
      label: `${KIND_NAMES[kind]} ${status === 'RUNNING' ? 'running' : 'queued'}`,
    });
  }
  return (['ci', 'automation'] as const).flatMap((kind) => found.get(kind) ?? []);
}
