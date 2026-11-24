import { payloadField, type WithPayload } from '$core/events/refresh-on';

/**
 * qits-orchestrator's events about its process runs on qits-events (qits-2472): a run opened
 * (`ProcessRunChanged`, `RUNNING`) or closed (`SUCCEEDED`, `FAILED`), and one of its steps started
 * (`ProcessRunStepChanged`, `RUNNING`) or ended (`SUCCEEDED`, `FAILED`, `SKIPPED`). Each payload
 * names the process (`kind`) and the run (`runId`); a step's names the step too (`stepId`). Its
 * `runId` is an orchestrator run, not the CI run `PayloadIds.runId` stands for, so each field is
 * read by name (`payloadField`).
 */
export const PROCESS_RUN_EVENTS = ['ProcessRunChanged', 'ProcessRunStepChanged'] as const;

/** Whether a process run event is about a run of the process `kind` (its payload's `kind`). */
export function ofProcess(event: WithPayload, kind: string | undefined): boolean {
  const named = payloadField(event, 'kind');
  return !!named && named === kind;
}

/** Whether a process run event is about the run `runId` (its payload's `runId`). */
export function ofRun(event: WithPayload, runId: string | undefined): boolean {
  const named = payloadField(event, 'runId');
  return !!named && named === runId;
}

/** Whether a process run event is about the step `stepId` of the run `runId` (`runId`, `stepId`). */
export function ofStep(
  event: WithPayload,
  runId: string | undefined,
  stepId: string | undefined,
): boolean {
  const named = payloadField(event, 'stepId');
  return ofRun(event, runId) && !!named && named === stepId;
}
