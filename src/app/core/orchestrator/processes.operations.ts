import { qitsOperation } from '@qits/angular';
import {
  getProcessRun,
  getProcessRunStep,
  listProcesses,
  listProcessRuns,
  startProcessRun,
} from '../../api/orchestrator';
import {
  GET_PROCESS_RUN,
  GET_PROCESS_RUN_STEP,
  LIST_PROCESS_RUNS,
  LIST_PROCESSES,
  START_PROCESS_RUN_REFUSAL,
  START_PROCESS_RUN_STARTED,
} from './processes.consumes';

/**
 * qits-orchestrator's process doors declared as operations (qits-2359), for the Orchestrator
 * section's process page (`OrchestratorProcessPage`), which reads through `qitsResource` and starts
 * a run through `qitsMutation`; `processes.operations.pact.spec.ts` binds each with the same
 * provider, operationId and `consumes`. Every door answers `qits:admin`, `qits:admin-agent`,
 * `qits:desk-admin`, `qits:system` and `qits:agent` only; anyone else gets a 403. qits-orchestrator
 * publishes no domain event.
 */

/** The technical processes (`listProcesses`, `GET /orchestrator/api/processes`): gc alone today. */
export const PROCESS_LIST = qitsOperation({
  provider: 'qits-orchestrator-service',
  operationId: 'listProcesses',
  method: 'GET',
  call: listProcesses,
  consumes: LIST_PROCESSES,
});

/**
 * A process's runs, newest first (`listProcessRuns`, `GET /processes/{kind}/runs`): the latest 20
 * (the door's default `limit`, which the page does not send). 404: no process of that kind.
 */
export const PROCESS_RUNS = qitsOperation({
  provider: 'qits-orchestrator-service',
  operationId: 'listProcessRuns',
  method: 'GET',
  call: listProcessRuns,
  consumes: LIST_PROCESS_RUNS,
});

/**
 * One run with its steps (`getProcessRun`, `GET /runs/{id}`). The page always sends
 * `bodies=false`: a gc run's steps carry megabytes of request and response bodies (2.8 MB measured
 * for one read of a running run), which the board never shows; a step's bodies come from
 * `PROCESS_RUN_STEP` when it is opened. 404: no such run.
 */
export const PROCESS_RUN = qitsOperation({
  provider: 'qits-orchestrator-service',
  operationId: 'getProcessRun',
  method: 'GET',
  call: getProcessRun,
  consumes: GET_PROCESS_RUN,
});

/**
 * One step of a run, whole (`getProcessRunStep`, `GET /runs/{id}/steps/{stepId}`): its request body
 * and its response. 404: no such run, or no such step in it.
 */
export const PROCESS_RUN_STEP = qitsOperation({
  provider: 'qits-orchestrator-service',
  operationId: 'getProcessRunStep',
  method: 'GET',
  call: getProcessRunStep,
  consumes: GET_PROCESS_RUN_STEP,
});

/**
 * Starts a run (`startProcessRun`, `POST /processes/{kind}/runs`, body `{ dryRun }`): 202 with the
 * new run's id. A real run deletes, so the page asks first and never queues it offline or sends it
 * again by itself. 404: no process of that kind; 409: a run of the kind is already active, or an
 * artifacts cleanup sweep is in flight, in the service's words (`message`).
 */
export const START_PROCESS_RUN = qitsOperation({
  provider: 'qits-orchestrator-service',
  operationId: 'startProcessRun',
  method: 'POST',
  call: startProcessRun,
  consumes: START_PROCESS_RUN_STARTED,
  errorConsumes: START_PROCESS_RUN_REFUSAL,
});
