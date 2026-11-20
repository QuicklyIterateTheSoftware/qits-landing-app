import type { Consumed } from '@qits/angular';
import type {
  PlanArtifactsCleanupRepositoryResponses,
  SweepArtifactsCleanupRepositoryResponses,
} from '../../api/orchestrator';

/**
 * What the app reads from qits-orchestrator's artifacts cleanup doors (qits-2329): one store
 * repository's collection plan and the receipt of its sweep, which qits-orchestrator answers with
 * qits-artifacts' JSON verbatim. `cleanup.operations.ts` declares each with these lists, so nothing
 * can read any other field, and `cleanup.operations.pact.spec.ts` binds the same. To read another
 * field, add it here.
 *
 * Left out on purpose: `untouchable` (the row-less blob pool), a store-wide figure rather than this
 * repository's, which the recordings drop; the blob ids, the pins' `keeps` and `url`, `dryRun`, the
 * receipt's `disk` and `runId`.
 */

/**
 * `ARTIFACTS_CLEANUP_PLAN` (`planArtifactsCleanupRepository`): the header (`repository`, `type`,
 * `generatedAt`), the configured rule and the type's `note`/`error` (`strategy` `null`: no
 * collector), how the run read each live pin source (`executable`, `pinFailures`, `pins[]`), both
 * identity lists with the rule that decided each, and the blob figures (`sweep`: what a run now
 * takes; `structural`: what the rule condemns whatever the files' age).
 */
export const PLAN_ARTIFACTS_CLEANUP = [
  'repository',
  'type',
  'generatedAt',
  'graceWindow',
  'executable',
  'pinFailures',
  'pins[].source',
  'pins[].answered',
  'pins[].outcome',
  'pins[].tookMillis',
  'pins[].pinCount',
  'configuration.rule',
  'strategy',
  'note',
  'error',
  'dead[].identity',
  'dead[].rule',
  'kept[].identity',
  'kept[].rule',
  'sweep.blobCount',
  'sweep.reclaimableBytes',
  'sweep.withheldByGraceWindow',
  'sweep.withheldBytes',
  'structural.blobCount',
  'structural.reclaimableBytes',
] as const;

/** One repository's cleanup plan, cut to what the page reads. */
export type CleanupPlan = Consumed<
  PlanArtifactsCleanupRepositoryResponses[200],
  typeof PLAN_ARTIFACTS_CLEANUP
>;

/** One live pin source, as the plan's run read it. */
export type CleanupPin = NonNullable<CleanupPlan['pins']>[number];

/** One identity of the plan, with the rule that condemned or kept it. */
export type CleanupIdentity = NonNullable<CleanupPlan['dead']>[number];

/**
 * `SWEEP_ARTIFACTS_CLEANUP` (`sweepArtifactsCleanupRepository`): the receipt that replaces the plan
 * on the page: when it ran, whether it was `aborted` (nothing deleted), a type's `error`, the
 * identities deleted and those withheld whole by the grace window, and the blob counters.
 */
export const SWEEP_ARTIFACTS_CLEANUP = [
  'repository',
  'executedAt',
  'graceWindow',
  'aborted',
  'error',
  'deleted[].identity',
  'deleted[].rule',
  'withheldByGraceWindow[].identity',
  'withheldByGraceWindow[].rule',
  'sweep.blobsUnlinked',
  'sweep.bytesReclaimed',
  'sweep.withheldByGraceWindow',
  'sweep.withheldBytes',
  'sweep.stillReferenced',
  'sweep.alreadyGone',
] as const;

/** A sweep's receipt, cut to what the page reads. */
export type CleanupReceipt = Consumed<
  SweepArtifactsCleanupRepositoryResponses[200],
  typeof SWEEP_ARTIFACTS_CLEANUP
>;
