import type { ReleaseRequest } from './release-request.consumes';
import { approvalDecision, gateSentence, gateToneOf } from './release-pipeline';
import { hasReleased, releaseConflict, shortShaOrNone } from './release-request-model';

/**
 * A release request's whole lifecycle, top to bottom, as its page draws it: the fold and its
 * automations, the QA run, the quality gates, publish, deployment, the deployment's gates, and
 * the tag reaching main. Every check is a row of its own, read from the answer as it comes:
 * automations and gates are drawn generically (their own label, state, detail, sub-checks and run),
 * so one the backend adds appears without a change here. Pure; `app-release-lifecycle` draws it.
 */

/** How a stage or a check stands. */
export type StepState =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'unknown'
  | 'not-reported';

/** A named sub-check of a gate. */
export interface SubCheck {
  readonly name: string;
  readonly state: StepState;
  readonly word: string;
  readonly detail: string | null;
}

/** One check: a row in a stage. */
export interface Step {
  readonly key: string;
  readonly label: string;
  readonly state: StepState;
  /** The backend's own word for the state, for the chip. */
  readonly word: string;
  readonly detail: string | null;
  readonly checks: readonly SubCheck[];
  /** A CI run to link, if the answer names one. */
  readonly runId: string | null;
  /** What the row is, for the actions the page offers on it. */
  readonly kind: 'fold' | 'automations' | 'phase' | 'gate' | 'approval' | 'release' | 'finalized';
  /** The phase a `phase` row is (QA, PUBLISH, DEPLOY), to run it again. */
  readonly phase?: string;
  /** The phase may be run again. */
  readonly rerunnable?: boolean;
  /** The approval row asks a person now: Approve and Decline go here. */
  readonly asks?: boolean;
  /** A deployment request to link (the deployment phase's id). */
  readonly deploymentRequestId?: string | null;
}

/** One stage of the lifecycle. */
export interface Stage {
  readonly key: 'fold' | 'qa' | 'gates' | 'publish' | 'deploy' | 'deploy-gates' | 'finalized';
  readonly label: string;
  readonly state: StepState;
  /** The first stage that has not passed: where the request is now. */
  readonly current: boolean;
  /** After the current stage: not reached yet. */
  readonly future: boolean;
  readonly steps: readonly Step[];
  /** A sentence under the stage's name, if it has one. */
  readonly note: string | null;
}

/** A gate in the shape the backend is adding (`external/release-gate-classes`). */
interface GenericGate {
  readonly kind?: string;
  readonly label?: string;
  readonly position?: string;
  readonly state?: string;
  readonly detail?: string;
  readonly checks?: readonly { name?: string; state?: string; detail?: string }[];
  readonly runId?: string;
  readonly between?: string;
}

/** Fallback labels for today's gate kinds, while the answer names no label. */
const GATE_LABELS: Readonly<Record<string, string>> = {
  CI: 'CI build passed',
  AUTOMATIONS: 'Automations passed or waived',
  APPROVAL: 'Approval',
  PUBLISH: 'Release pipeline of the tag green',
  DEPLOYMENT: 'Deployment live',
};

/** A backend word as a step state. */
export function stepStateOf(word: string | undefined): StepState {
  switch (word) {
    case 'SUCCESS':
    case 'PASSED':
    case 'FRESH':
    case 'COMMITTED':
    case 'APPROVED':
      return 'passed';
    case 'RUNNING':
    case 'REQUESTED':
      return 'running';
    case 'FAILED':
    case 'FAILURE':
    case 'DECLINED':
    case 'REJECTED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'SUPERSEDED':
      return 'pending';
    case 'NOT_REQUIRED':
    case 'WAIVED':
    case 'SKIPPED':
      return 'skipped';
    case 'PENDING':
    case 'WAITING':
    case undefined:
    case '':
      return 'pending';
    default:
      return 'unknown';
  }
}

/** A word for reading: `NOT_REQUIRED` → `not required`. */
const wordOf = (word: string | undefined, fallback = 'pending') =>
  (word || fallback).toLowerCase().replace(/_/g, ' ');

/** A stage's state from its steps: failed beats running beats pending; all passed or skipped: passed. */
export function stageState(steps: readonly Step[]): StepState {
  const states = steps.map((step) => step.state);
  if (states.length === 0) return 'pending';
  for (const state of ['failed', 'cancelled', 'unknown', 'running'] as const) {
    if (states.includes(state)) return state;
  }
  if (states.every((state) => state === 'skipped')) return 'skipped';
  if (states.every((state) => state === 'passed' || state === 'skipped')) return 'passed';
  if (states.some((state) => state === 'passed') && states.includes('pending')) return 'running';
  if (states.every((state) => state === 'not-reported')) return 'not-reported';
  return 'pending';
}

/** Where a gate sits: before publish (after QA), or after deployment (before finalized). */
function gateStage(gate: GenericGate): 'gates' | 'publish' | 'deploy-gates' {
  const where = (gate.position ?? gate.between ?? '').toUpperCase();
  if (gate.kind === 'PUBLISH' || where === 'PUBLISH_DEPLOY') return 'publish';
  if (where.includes('FINALIZED') || where.startsWith('AFTER_DEPLOY')) return 'deploy-gates';
  if (gate.kind === 'DEPLOYMENT' && !where) return 'deploy-gates';
  return 'gates';
}

/** Whether the answer's gates carry the generic shape (a label and a position on each). */
export function hasGenericGates(gates: readonly GenericGate[]): boolean {
  return gates.length > 0 && gates.every((gate) => !!gate.label && !!gate.position);
}

/** A gate as a row. */
function gateStep(request: ReleaseRequest, gate: GenericGate, generic: boolean): Step {
  const state = stepStateOf(gate.state);
  const fallback =
    gate.detail?.trim() ||
    (generic ? null : gateSentence(request, gate, gateToneOf(gate.state)).replace(/^— /, ''));
  return {
    key: `gate:${gate.position ?? gate.between ?? ''}:${gate.kind}`,
    label: gate.label || GATE_LABELS[gate.kind ?? ''] || wordOf(gate.kind, 'gate'),
    state,
    word: wordOf(gate.state),
    detail: fallback || null,
    checks: (gate.checks ?? []).map((check) => ({
      name: check.name ?? '',
      state: stepStateOf(check.state),
      word: wordOf(check.state),
      detail: check.detail?.trim() || null,
    })),
    runId: gate.runId ?? null,
    kind: gate.kind === 'APPROVAL' ? 'approval' : 'gate',
  };
}

/** The approval as a row, from the request's approval fields (the gate may not be reported). */
function approvalStep(request: ReleaseRequest, gate: Step | undefined): Step {
  const word = request.approvalState;
  const required = request.approvalRequired === true;
  const decided = word === 'APPROVED' || word === 'DECLINED';
  const note = request.approvalNote?.trim();
  const detail = !required
    ? 'This repository needs no person to approve its releases.'
    : decided
      ? `${approvalDecision(request).replace(/^./, (c) => c.toUpperCase())}${note ? ` — “${note}”` : ''}`
      : (gate?.detail ?? 'Waiting for a person.');
  return {
    key: gate?.key ?? 'approval',
    label: gate?.label ?? 'Approval',
    state: required ? (gate?.state ?? stepStateOf(word)) : 'skipped',
    word: required ? wordOf(word ?? gate?.word) : 'not required',
    detail,
    checks: gate?.checks ?? [],
    runId: gate?.runId ?? null,
    kind: 'approval',
    asks: required && request.state === 'PENDING' && !decided,
  };
}

/** A pipeline phase as a row. */
/** Without a pipeline (an older answer), a phase's state follows its gate. */
const PHASE_GATES: Readonly<Record<string, string>> = { QA: 'CI', PUBLISH: 'PUBLISH' };

function phaseStep(request: ReleaseRequest, phase: string, label: string): Step {
  const reported = request.pipeline?.phases?.find((entry) => entry.phase === phase);
  if (!request.pipeline && PHASE_GATES[phase]) {
    const gate = request.gates?.find((entry) => entry.kind === PHASE_GATES[phase]);
    if (gate) {
      const state = gate.state === 'PENDING' ? 'running' : stepStateOf(gate.state);
      return {
        key: `phase:${phase}`,
        label,
        state,
        word: wordOf(gate.state),
        detail: null,
        checks: [],
        runId: null,
        kind: 'phase',
        phase,
      };
    }
  }
  const word = reported?.state;
  const state = reported ? stepStateOf(word) : 'pending';
  return {
    key: `phase:${phase}`,
    label,
    state,
    word: wordOf(word),
    detail: reported?.detail?.trim() || null,
    checks: [],
    runId: phase === 'DEPLOY' ? null : (reported?.runId ?? null),
    deploymentRequestId: phase === 'DEPLOY' ? (reported?.runId ?? null) : null,
    kind: 'phase',
    phase,
    rerunnable: !!reported && word !== 'SUCCESS' && (word !== 'PENDING' || !!reported.runId),
  };
}

/** Whether the request deploys: the pipeline reports a deployment phase or gate. */
function deploys(request: ReleaseRequest): boolean {
  const pipeline = request.pipeline;
  return (
    !!pipeline?.phases?.some((phase) => phase.phase === 'DEPLOY') ||
    !!pipeline?.gates?.some((gate) => gate.kind === 'DEPLOYMENT') ||
    !!request.gates?.some((gate) => gate.kind === 'DEPLOYMENT')
  );
}

/** Not reported: a check the user wants that the answer does not carry. */
const notReported = (key: string, label: string): Step => ({
  key,
  label,
  state: 'not-reported',
  word: 'not reported',
  detail: null,
  checks: [],
  runId: null,
  kind: 'gate',
});

/**
 * The whole lifecycle of `request`. The fold starts both the QA run and the automations, which run
 * side by side (qits-projects' `ReleaseRequests`: a fold announces the request, which starts QA,
 * and asks qits-maintenance for the automations); the gates then decide in order.
 */
export function releaseLifecycle(request: ReleaseRequest): readonly Stage[] {
  const allGates: readonly GenericGate[] = (request.pipeline?.gates ??
    request.gates ??
    []) as readonly GenericGate[];
  const generic = hasGenericGates(allGates);
  const gateSteps = allGates.map((gate) => ({
    stage: gateStage(gate),
    step: gateStep(request, gate, generic),
  }));

  // P1: the fold, then the automations.
  const conflict = releaseConflict(request);
  const fold: Step = {
    key: 'fold',
    label: 'Fold the sources',
    state: conflict
      ? 'failed'
      : request.mergedSha
        ? 'passed'
        : request.state === 'PENDING'
          ? 'running'
          : 'pending',
    word: conflict ? 'conflicted' : request.mergedSha ? 'folded' : 'not folded',
    detail: conflict
      ? null
      : request.mergedSha
        ? `${(request.sources ?? []).length} sources merged onto ${request.backingBranch} at ${shortShaOrNone(request.mergedSha)}`
        : null,
    checks: [],
    runId: null,
    kind: 'fold',
  };
  const automations = request.automations ?? [];
  const automationStep: Step = {
    key: 'automations',
    label: 'Automations',
    state:
      automations.length === 0
        ? 'skipped'
        : stageState(
            automations.map((row) => ({
              ...notReported('', ''),
              state: stepStateOf(row.state),
            })),
          ),
    word: automations.length === 0 ? 'none apply' : '',
    detail: null,
    checks: [],
    runId: null,
    kind: 'automations',
  };

  // P3: the quality gates before publish; the approval among them, always shown.
  const beforePublish = gateSteps.filter((entry) => entry.stage === 'gates').map((e) => e.step);
  const approvalGate = beforePublish.find((step) => step.kind === 'approval');
  const gates = [
    ...beforePublish.filter((step) => step.kind !== 'approval'),
    approvalStep(request, approvalGate),
  ];

  // P4: publish: the phase, its gate, the version.
  const publishGates = gateSteps.filter((entry) => entry.stage === 'publish').map((e) => e.step);
  const release: Step = {
    key: 'release',
    label: 'Tag the release',
    state: hasReleased(request) ? 'passed' : 'pending',
    word: request.version ? request.version : 'no tag yet',
    detail: request.releasedSha ? `at ${shortShaOrNone(request.releasedSha)}` : null,
    checks: [],
    runId: null,
    kind: 'release',
  };
  const publish = [
    release,
    phaseStep(request, 'PUBLISH', 'Release run of the tag'),
    ...publishGates,
  ];

  // P5, P6: deployment, and its gates.
  const afterDeploy = gateSteps
    .filter((entry) => entry.stage === 'deploy-gates')
    .map((e) => e.step);
  const deploying = deploys(request) || afterDeploy.length > 0;
  const deploy = deploying
    ? [phaseStep(request, 'DEPLOY', 'Deploy the release')]
    : [
        {
          ...notReported('phase:DEPLOY', 'Deploy the release'),
          state: 'skipped' as const,
          word: 'nothing deploys',
          detail: 'Nothing deploys this repository.',
        },
      ];
  // The DEPLOYMENT gate passes once the tag reaches main ("went live"); a later rollback shows
  // only on the deployment phase, so "not rolled back" is a check the answer does not report.
  const deployGates = deploying
    ? generic
      ? afterDeploy
      : [...afterDeploy, notReported('gate:not-rolled-back', 'Not rolled back')]
    : [
        {
          ...notReported('gate:deploy', 'Deployment gates'),
          state: 'skipped' as const,
          word: 'none',
        },
      ];

  const finalized: Step = {
    key: 'finalized',
    label: 'The tag reaches main',
    state: request.mergedToMainAt ? 'passed' : 'pending',
    word: request.mergedToMainAt ? 'on main' : 'not on main yet',
    detail: null,
    checks: [],
    runId: null,
    kind: 'finalized',
  };

  const stages: Omit<Stage, 'current' | 'future' | 'state'>[] = [
    {
      key: 'fold',
      label: 'P1 · Fold & automations',
      steps: [fold, automationStep],
      note:
        'The automations run alongside the QA run of the same fold. One that commits adds to the ' +
        'request, which folds again and starts a new QA run.',
    },
    {
      key: 'qa',
      label: 'P2 · CI / QA',
      steps: [phaseStep(request, 'QA', 'QA run of the fold')],
      note: 'Runs alongside the automations, on every fold.',
    },
    { key: 'gates', label: 'P3 · Quality gates', steps: gates, note: null },
    { key: 'publish', label: 'P4 · Publish', steps: publish, note: null },
    { key: 'deploy', label: 'P5 · Deployment', steps: deploy, note: null },
    { key: 'deploy-gates', label: 'P6 · Deployment quality gates', steps: deployGates, note: null },
    { key: 'finalized', label: '→ Finalized', steps: [finalized], note: null },
  ];
  const states = stages.map((stage) => stageState(stage.steps));
  const settled = (state: StepState) => state === 'passed' || state === 'skipped';
  const current = states.findIndex((state) => !settled(state));
  // P1 and P2 run side by side: while either is unsettled, both are where the request is now.
  const alongside = current === 0 || current === 1 ? [0, 1] : [current];
  const last = Math.max(...alongside);
  return stages.map((stage, index) => ({
    ...stage,
    state: states[index],
    current: alongside.includes(index) && !settled(states[index]),
    future: current >= 0 && index > last,
  }));
}

/** One point of a request's lifecycle in a compact summary: a phase chip or a gate pip. */
export interface SummaryPoint {
  readonly key: string;
  readonly kind: 'chip' | 'pip';
  /** The chip's text, or the pip's name (for its tooltip). */
  readonly label: string;
  readonly state: StepState;
  /** The tooltip: the point's name and state. */
  readonly title: string;
}

/**
 * The lifecycle as a compact line, in its order (the same model as the panel): automations (with
 * how many are done while some run), CI, a pip per quality gate, publish, deployment (when
 * something deploys), a pip per deployment gate, finalized.
 */
export function lifecycleSummary(request: ReleaseRequest): readonly SummaryPoint[] {
  const stages = releaseLifecycle(request);
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  const points: SummaryPoint[] = [];
  const chip = (key: string, label: string, state: StepState, word: string = state) =>
    points.push({ key, kind: 'chip', label, state, title: `${label}: ${word}` });
  const pips = (key: 'gates' | 'deploy-gates') => {
    for (const step of byKey.get(key)?.steps ?? []) {
      points.push({
        key: step.key,
        kind: 'pip',
        label: step.label,
        state: step.state,
        title: `${step.label}: ${step.word || step.state}`,
      });
    }
  };
  const automations = request.automations ?? [];
  const automationsGate = request.gates?.find((gate) => gate.kind === 'AUTOMATIONS');
  if (automations.length === 0 && automationsGate && !request.automations) {
    // An answer without the rows: the gate says how they stand.
    chip(
      'automations',
      'Automations',
      stepStateOf(automationsGate.state),
      wordOf(automationsGate.state),
    );
  }
  if (automations.length > 0) {
    const done = automations.filter((row) => {
      const state = stepStateOf(row.state);
      return state === 'passed' || state === 'skipped';
    }).length;
    const state = byKey.get('fold')!.steps.find((step) => step.kind === 'automations')!.state;
    chip(
      'automations',
      done === automations.length ? 'Automations' : `Automations ${done}/${automations.length}`,
      state,
    );
  }
  const qa = byKey.get('qa')!;
  chip('qa', 'CI', qa.state, qa.steps[0]?.word);
  pips('gates');
  chip('publish', 'Publish', byKey.get('publish')!.state);
  const deploy = byKey.get('deploy')!;
  if (deploy.state !== 'skipped') {
    chip('deploy', 'Deploy', deploy.state, deploy.steps[0]?.word);
    pips('deploy-gates');
  }
  chip('finalized', 'Finalized', byKey.get('finalized')!.state);
  return points;
}
