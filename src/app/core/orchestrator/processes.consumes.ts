import type { Consumed } from '@qits/angular';
import type {
  GetProcessRunResponses,
  GetProcessRunStepResponses,
  ListProcessesResponses,
  ListProcessRunsResponses,
  StartProcessRunResponses,
} from '../../api/orchestrator';

/**
 * What the app reads from qits-orchestrator's process doors (qits-2359), for the Orchestrator
 * section's process page. `processes.operations.ts` declares each with these lists, so nothing can
 * read any other field, and `processes.operations.pact.spec.ts` binds the same. To read another
 * field, add it here.
 *
 * Left out on purpose: a process's step definitions (`steps[]` of `listProcesses`: a run carries
 * its own steps, which is what the board draws), a run's `kind` (the URL names it) and its
 * `summary` (every step's summary joined into one line, ~1.5 KB live; the table shows it, the run's
 * own facts show the steps instead).
 */

/**
 * `PROCESS_LIST` (`listProcesses`): the header's name and lede, whether the kind exists, and
 * whether it has a dry run (`dryRunnable`, qits-2490: gc has, scan and sbom-check have none, and
 * their door answers a dry start 400), which decides whether the page offers Dry run.
 */
export const LIST_PROCESSES = ['[].kind', '[].name', '[].description', '[].dryRunnable'] as const;

/** One process, cut to what the page reads. */
export type Process = Consumed<ListProcessesResponses[200], typeof LIST_PROCESSES>[number];

/** `PROCESS_RUNS` (`listProcessRuns`): the run table's rows, newest first. */
export const LIST_PROCESS_RUNS = [
  '[].id',
  '[].trigger',
  '[].dryRun',
  '[].status',
  '[].startedAt',
  '[].finishedAt',
  '[].summary',
] as const;

/** One run of the list, cut to what the page reads. */
export type ProcessRunSummary = Consumed<
  ListProcessRunsResponses[200],
  typeof LIST_PROCESS_RUNS
>[number];

/**
 * `PROCESS_RUN` (`getProcessRun`, always with `bodies=false`): the shown run's facts and its steps
 * for the board, each with `responseBytes` (what opening its response costs) but never a body.
 */
export const GET_PROCESS_RUN = [
  'id',
  'trigger',
  'dryRun',
  'status',
  'startedAt',
  'finishedAt',
  'steps[].id',
  'steps[].name',
  'steps[].target',
  'steps[].dependsOn',
  'steps[].status',
  'steps[].startedAt',
  'steps[].finishedAt',
  'steps[].httpStatus',
  'steps[].request.method',
  'steps[].request.url',
  'steps[].error',
  'steps[].summary',
  'steps[].responseBytes',
] as const;

/** The shown run, cut to what the page reads. */
export type ProcessRun = Consumed<GetProcessRunResponses[200], typeof GET_PROCESS_RUN>;

/** One step of the shown run, as the board draws it. */
export type ProcessRunStep = NonNullable<ProcessRun['steps']>[number];

/**
 * `PROCESS_RUN_STEP` (`getProcessRunStep`): the open step's call, whole: its request (the body is
 * JSON text, null for a GET) and its response (JSON text, capped at 1 MiB by the service, which
 * then ends it with its own marker), with `responseBytes` for the toggle. The step's facts, summary
 * and error are the shown run's (`PROCESS_RUN`), which the poll keeps current.
 */
export const GET_PROCESS_RUN_STEP = [
  'id',
  'request.method',
  'request.url',
  'request.body',
  'response',
  'responseBytes',
] as const;

/** The open step with its bodies, cut to what the page reads. */
export type ProcessRunStepDetail = Consumed<
  GetProcessRunStepResponses[200],
  typeof GET_PROCESS_RUN_STEP
>;

/** `START_PROCESS_RUN` (`startProcessRun`): the started run's id, which the page then shows. */
export const START_PROCESS_RUN_STARTED = ['id'] as const;

/**
 * `START_PROCESS_RUN`'s refusal: a 409 (a run of the kind is already active, or an artifacts
 * cleanup sweep is in flight) carries the service's reason as `message`, which the page says.
 */
export const START_PROCESS_RUN_REFUSAL = ['message'] as const;

/** A started run, cut to what the page reads. */
export type StartedProcessRun = Consumed<
  StartProcessRunResponses[202],
  typeof START_PROCESS_RUN_STARTED
>;
